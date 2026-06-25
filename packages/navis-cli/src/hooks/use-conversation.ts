import { useCallback, useRef, useState } from "react";
import { config } from "navis/config.js";
import { askClaude } from "navis/claude/ask.js";
import { localChatEnv } from "navis/claude/local-env.js";
import { curateTurn } from "navis/claude/curator.js";
import { Turn, TurnInput } from "src/types/types.js";
import { statusLabel } from "src/utils/status.js";

type Session = { sessionId: string; contextTokens: number };

// CLI 의 "두뇌" — 턴 목록 · 세션 · 응답 진행 상태를 보유하고, 한 메시지를
// askClaude 로 보내 스트리밍·저장·세션 갱신까지 처리한다. 앱과 같은 askClaude/curator 공유.
// UI(키 입력·슬래시 메뉴·모델 선택)는 호출부(App)가 가지고, 여기는 대화 흐름만 책임진다.
export function useConversation(projectContext: string | undefined) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState(""); // 누적 중인 답변 텍스트
  const [activity, setActivity] = useState(""); // 현재 도구/상태 라벨
  const nextId = useRef(0);

  const addTurn = useCallback((partial: TurnInput) => {
    setTurns((prev) => [...prev, { ...partial, id: nextId.current++ } as Turn]);
  }, []);

  // /clear 용 — 화면 비우기는 호출부가 stdout 시퀀스로 처리하고, 상태만 비운다.
  const clearTurns = useCallback(() => setTurns([]), []);

  // /reset 용 — 다음 메시지부터 새 세션.
  const resetSession = useCallback(() => {
    setSession(null);
    addTurn({ kind: "note", text: "세션 초기화 — 다음 메시지부터 새 세션" });
  }, [addTurn]);

  // 일반 메시지 한 건 전송. model 은 호출 시점 값을 인자로 받아 stale 클로저를 피한다.
  const sendMessage = useCallback(
    async (trimmed: string, model: string) => {
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
          env: localChatEnv,
          resumeSessionId: resumeId,
          projectContext,
          // 로컬 실행 — 현재 폴더 코드를 직접 Read/Edit/Write/Bash 로 작업(Claude Code 식).
          localExecution: true,
          // /model 로 고른 모델로 응답(기본은 config.model).
          modelOverride: model,
          onStatus: (s) => setActivity(statusLabel(s)),
          onTextDelta: (d) => setStreamingText((p) => p + d),
          onToolComplete: (label) =>
            addTurn({ kind: "note", text: `🔧 ${label}` }),
        });
        setSession({ sessionId, contextTokens });
        addTurn({ kind: "assistant", text, saved });
        void curateTurn({
          userText: trimmed,
          assistantText: text,
          projectContext,
        });
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
    [session, projectContext, addTurn],
  );

  return {
    turns,
    addTurn,
    clearTurns,
    resetSession,
    pending,
    streamingText,
    activity,
    sendMessage,
  };
}
