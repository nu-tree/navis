#!/usr/bin/env node
import React, { useCallback, useRef, useState } from "react";
import { render, Box, Static, Text, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { config } from "./config.js";
import { askClaude } from "./claude/ask.js";
import { curateTurn } from "./claude/curator.js";
import { detectProject } from "./project.js";

// navis CLI — Claude Code 스타일 Ink(React-for-CLI) REPL.
// 앱과 동일한 두뇌(askClaude/curator) 공유, 시작 디렉터리에서 프로젝트
// 자동 감지 → 이 대화의 save는 자동 태깅.

type TurnInput =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; saved: boolean }
  | { kind: "note"; text: string }
  | { kind: "error"; text: string };
type Turn = TurnInput & { id: number };

const projectContext = detectProject();

function App() {
  const { exit } = useApp();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState<{ sessionId: string; contextTokens: number } | null>(
    null,
  );
  // 진행 중 응답의 실시간 상태(Claude Code 식 스트리밍).
  const [streamingText, setStreamingText] = useState(""); // 누적 중인 답변 텍스트
  const [activity, setActivity] = useState(""); // 현재 도구/상태 라벨
  const nextId = useRef(0);

  const addTurn = useCallback((partial: TurnInput) => {
    const turn = { ...partial, id: nextId.current++ } as Turn;
    setTurns((prev) => [...prev, turn]);
  }, []);

  // Ctrl+C 즉시 종료. ink는 raw stdin을 잡고 있어 SIGINT 자동 처리가 안 먹힘.
  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === "c") exit();
  });

  const submit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      setInput("");
      if (!trimmed) return;

      // 슬래시 명령 — 메인 턴 거치지 않고 처리.
      if (trimmed === "/quit" || trimmed === "/exit") {
        exit();
        return;
      }
      if (trimmed === "/reset") {
        setSession(null);
        addTurn({ kind: "note", text: "세션 초기화 — 다음 메시지부터 새 세션" });
        return;
      }
      if (trimmed === "/project") {
        addTurn({
          kind: "note",
          text: `현재 프로젝트: ${projectContext ?? "(감지 안 됨 — 개인 기억)"}`,
        });
        return;
      }

      addTurn({ kind: "user", text: trimmed });
      setPending(true);

      // 한도 초과 시 새 세션.
      const overLimit =
        session !== null && session.contextTokens >= config.contextTokenLimit;
      const resumeId = session && !overLimit ? session.sessionId : undefined;
      if (overLimit && session) {
        const k = Math.round(session.contextTokens / 1000);
        const limitK = Math.round(config.contextTokenLimit / 1000);
        addTurn({
          kind: "note",
          text: `대화 한도(${limitK}k) 도달 — 새 세션 시작 (이전 ~${k}k 토큰)`,
        });
      }

      setStreamingText("");
      setActivity("");
      try {
        const { text, sessionId, contextTokens, saved } = await askClaude({
          prompt: trimmed,
          resumeSessionId: resumeId,
          // CLI 는 이미지 첨부 없음, profile_update 항상 금지(대화 경로).
          projectContext,
          // 로컬 실행 — 현재 폴더 코드를 직접 Read/Edit/Write/Bash 로 작업(Claude Code 식).
          localExecution: true,
          // Claude Code 처럼 실시간 출력: 토큰 델타를 즉시 흘리고, 도구 진행/완료를
          // 화면에 표시한다(완성 텍스트를 한 번에 던지지 않음).
          onStatus: (s) => setActivity(statusLabel(s)),
          onTextDelta: (d) => setStreamingText((p) => p + d),
          onToolComplete: (label) => addTurn({ kind: "note", text: `🔧 ${label}` }),
        });
        setSession({ sessionId, contextTokens });
        addTurn({ kind: "assistant", text, saved });
        void curateTurn({ userText: trimmed, assistantText: text, projectContext });
      } catch (err) {
        addTurn({
          kind: "error",
          text: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setPending(false);
        setStreamingText("");
        setActivity("");
      }
    },
    [session, exit, addTurn],
  );

  const lastSavedSeen = [...turns].reverse().find((t) => t.kind === "assistant");
  const justSaved = lastSavedSeen?.kind === "assistant" ? lastSavedSeen.saved : false;

  return (
    <Box flexDirection="column">
      <Static items={turns}>
        {(turn) => <TurnView key={turn.id} turn={turn} />}
      </Static>

      {pending && (
        <Box flexDirection="column" marginTop={1}>
          {streamingText ? <Text>{streamingText}</Text> : null}
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text dimColor> {activity || "생각 중..."}</Text>
          </Box>
        </Box>
      )}

      <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="green">{"› "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          placeholder="메시지 입력 — /quit 종료, /reset 새 세션, /project 정보"
        />
      </Box>

      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>
          {projectContext ? `📁 ${projectContext}` : "📁 (개인 기억)"}
          {justSaved ? " · 💡 저장됨" : ""}
        </Text>
        <Text dimColor>/reset · /project · /quit</Text>
      </Box>
    </Box>
  );
}

// 도구 진행 상태(onStatus)를 사람이 읽을 라벨로. '__thinking__'/'__answering__' 은
// 의사 상태이고, 그 외엔 도구 진행 라벨이 그대로 들어온다.
function statusLabel(s: string): string {
  if (s === "__thinking__") return "생각 중...";
  if (s === "__answering__") return "답변 작성 중...";
  return s;
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "user") {
    return (
      <Box marginTop={1}>
        <Text color="cyan" bold>
          ❯{" "}
        </Text>
        <Text>{turn.text}</Text>
      </Box>
    );
  }
  if (turn.kind === "assistant") {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>{turn.text}</Text>
        {turn.saved && <Text dimColor>💡 저장됨</Text>}
      </Box>
    );
  }
  if (turn.kind === "note") {
    return (
      <Box marginTop={1}>
        <Text dimColor>· {turn.text}</Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text color="red">[오류] {turn.text}</Text>
    </Box>
  );
}

// 시작 배너 — 한번만 stdout에 흘려 보내고 Ink가 그 아래에서 그리기 시작.
console.log(
  `navis CLI — Claude Code 스타일${projectContext ? ` · 프로젝트: ${projectContext}` : ""}`,
);

render(<App />);
