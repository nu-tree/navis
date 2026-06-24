#!/usr/bin/env node
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Static, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { config } from "./config.js";
import { askClaude } from "./claude/ask.js";
import { curateTurn } from "./claude/curator.js";
import { detectProject } from "./project.js";
import { renderMarkdown } from "./cli/markdown.js";
import { matchCommands } from "./cli/commands.js";
import { MODEL_OPTIONS, modelLabel, resolveModel } from "./cli/models.js";
import { SlashMenu } from "./cli/SlashMenu.js";
import { ModelPicker } from "./cli/ModelPicker.js";

// navis CLI — Claude Code 스타일 Ink REPL.
// 앱과 동일한 두뇌(askClaude/curator) 공유, 시작 디렉터리에서 프로젝트 자동 감지.
// 답변은 마크다운으로 렌더, "/" 입력 시 명령 자동완성(방향키 선택), /model 로 모델 전환.

type TurnInput =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; saved: boolean }
  | { kind: "note"; text: string }
  | { kind: "error"; text: string };
type Turn = TurnInput & { id: number };

const projectContext = detectProject();

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState<{ sessionId: string; contextTokens: number } | null>(
    null,
  );
  const [model, setModel] = useState<string>(config.model);
  const [mode, setMode] = useState<"chat" | "model">("chat"); // model = 모델 선택 모달
  const [modelIndex, setModelIndex] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  const [streamingText, setStreamingText] = useState(""); // 누적 중인 답변 텍스트
  const [activity, setActivity] = useState(""); // 현재 도구/상태 라벨
  const nextId = useRef(0);

  const addTurn = useCallback((partial: TurnInput) => {
    setTurns((prev) => [...prev, { ...partial, id: nextId.current++ } as Turn]);
  }, []);

  // 슬래시 자동완성 후보(입력이 "/..."이고 응답 중/모델선택 중이 아닐 때만).
  const menuItems = useMemo(
    () => (mode === "chat" && !pending ? matchCommands(input) : []),
    [mode, pending, input],
  );
  // 입력이 바뀌면 강조를 맨 위로 되돌린다.
  useEffect(() => setMenuIndex(0), [input]);
  // submit/렌더가 항상 유효 범위의 강조 인덱스를 읽도록 ref 로 미러링(클램프).
  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;
  const clampedMenuIndex = Math.min(menuIndex, Math.max(0, menuItems.length - 1));
  const menuIndexRef = useRef(0);
  menuIndexRef.current = clampedMenuIndex;

  // 키 입력: Ctrl+C 종료 + 모델 선택 모달/슬래시 메뉴 방향키 네비게이션.
  // (일반 타이핑·왼/오 커서·Enter 제출은 TextInput 이 처리. 방향키 위/아래는 무시하므로
  //  여기서만 가로채 충돌이 없다.)
  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      exit();
      return;
    }
    if (pending) return;
    if (mode === "model") {
      const n = MODEL_OPTIONS.length;
      if (key.upArrow) setModelIndex((i) => (i - 1 + n) % n);
      else if (key.downArrow) setModelIndex((i) => (i + 1) % n);
      else if (key.return) {
        const picked = MODEL_OPTIONS[modelIndex];
        setModel(picked.id);
        setMode("chat");
        addTurn({ kind: "note", text: `모델 변경: ${picked.label}` });
      } else if (key.escape) {
        setMode("chat");
        addTurn({ kind: "note", text: "모델 변경 취소" });
      }
      return;
    }
    // chat 모드: 슬래시 메뉴 방향키.
    if (menuItems.length) {
      if (key.upArrow) setMenuIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setMenuIndex((i) => Math.min(menuItems.length - 1, i + 1));
      else if (key.escape) setInput("");
    }
  });

  const openModelPicker = useCallback(() => {
    const cur = MODEL_OPTIONS.findIndex((m) => m.id === model);
    setModelIndex(cur >= 0 ? cur : 0);
    setMode("model");
  }, [model]);

  // 슬래시 명령 실행(인자 없는 단순 명령). 처리하면 true.
  const handleSlash = useCallback(
    (name: string): boolean => {
      switch (name) {
        case "/quit":
        case "/exit":
          exit();
          return true;
        case "/reset":
          setSession(null);
          addTurn({ kind: "note", text: "세션 초기화 — 다음 메시지부터 새 세션" });
          return true;
        case "/project":
          addTurn({
            kind: "note",
            text: `현재 프로젝트: ${projectContext ?? "(감지 안 됨 — 개인 기억)"}`,
          });
          return true;
        case "/clear":
          // Static 은 append-only 라 상태만 비우면 이미 출력된 스크롤백이 남는다 →
          // 화면+스크롤백 클리어 시퀀스를 직접 쓴 뒤 턴을 비운다.
          stdout.write("\x1b[2J\x1b[3J\x1b[H");
          setTurns([]);
          return true;
        case "/help":
          addTurn({
            kind: "note",
            text:
              "명령어: /model 모델 변경 · /reset 새 세션 · /project 프로젝트 · /clear 화면 비우기 · /quit 종료",
          });
          return true;
        default:
          return false;
      }
    },
    [exit, addTurn, stdout],
  );

  const submit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      setInput("");
      if (!trimmed) return;

      // ── 슬래시 명령 ──────────────────────────────────────────────
      if (trimmed.startsWith("/")) {
        const cmd0 = trimmed.split(/\s+/)[0];
        const arg = trimmed.slice(cmd0.length).trim();
        // 인자가 없으면 메뉴에서 강조된 후보로 확장(방향키 선택 → Enter 로 실행).
        let name = cmd0;
        if (!arg) {
          const items = menuItemsRef.current;
          if (items.length) name = items[menuIndexRef.current].name;
        }
        if (name === "/model") {
          if (arg) {
            const m = resolveModel(arg);
            if (m) {
              setModel(m.id);
              addTurn({ kind: "note", text: `모델 변경: ${m.label}` });
            } else {
              addTurn({
                kind: "note",
                text: `알 수 없는 모델: ${arg} (사용 가능: ${MODEL_OPTIONS.map((o) => o.id).join(", ")})`,
              });
            }
          } else {
            openModelPicker();
          }
          return;
        }
        if (handleSlash(name)) return;
        addTurn({ kind: "note", text: `알 수 없는 명령: ${cmd0} ( /help 로 목록 )` });
        return;
      }

      // ── 일반 메시지 ──────────────────────────────────────────────
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
          projectContext,
          // 로컬 실행 — 현재 폴더 코드를 직접 Read/Edit/Write/Bash 로 작업(Claude Code 식).
          localExecution: true,
          // /model 로 고른 모델로 응답(기본은 config.model).
          modelOverride: model,
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
    [session, model, exit, addTurn, handleSlash, openModelPicker],
  );

  const lastAssistant = [...turns].reverse().find((t) => t.kind === "assistant");
  const justSaved = lastAssistant?.kind === "assistant" ? lastAssistant.saved : false;

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

      {mode === "model" ? (
        <ModelPicker options={MODEL_OPTIONS} index={modelIndex} current={model} />
      ) : menuItems.length ? (
        <SlashMenu items={menuItems} index={menuIndexRef.current} />
      ) : null}

      <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
        <Text color="green">{"› "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={submit}
          focus={mode === "chat" && !pending}
          placeholder="메시지 입력 — '/' 입력 시 명령어 (방향키 선택)"
        />
      </Box>

      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>
          {projectContext ? `📁 ${projectContext}` : "📁 (개인 기억)"}
          {` · 🧠 ${modelLabel(model)}`}
          {justSaved ? " · 💡 저장됨" : ""}
        </Text>
        <Text dimColor>/ 명령어 · /model 모델 · /quit 종료</Text>
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
        {/* 마크다운 → ANSI 로 렌더해 보기 쉽게. */}
        <Text>{renderMarkdown(turn.text)}</Text>
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
