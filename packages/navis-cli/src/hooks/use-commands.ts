import { useCallback } from "react";
import { TurnInput } from "src/types/types.js";
import { MODEL_OPTIONS, resolveModel } from "src/utils/models.js";

type Deps = {
  projectContext: string | undefined;
  addTurn: (turn: TurnInput) => void;
  resetSession: () => void;
  clearTurns: () => void;
  clearScreen: () => void;
  setModel: (id: string) => void;
  openModelPicker: () => void;
  exit: () => void;
};

// 슬래시 명령 실행기 — "각 명령이 무엇을 하는지"를 App 셸에서 떼어낸다.
// 반환된 run(name, arg) 은 명령을 처리하면 true, 모르는 명령이면 false 를 준다
// (호출부가 '알 수 없는 명령' 안내를 띄움).
export function useCommands(deps: Deps) {
  const {
    projectContext,
    addTurn,
    resetSession,
    clearTurns,
    clearScreen,
    setModel,
    openModelPicker,
    exit,
  } = deps;

  return useCallback(
    (name: string, arg: string): boolean => {
      // /model 은 인자 유무로 분기 — 인자 있으면 즉시 해석, 없으면 선택 모달.
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
        return true;
      }

      switch (name) {
        case "/quit":
        case "/exit":
          exit();
          return true;
        case "/reset":
          resetSession();
          return true;
        case "/project":
          addTurn({
            kind: "note",
            text: `현재 프로젝트: ${projectContext ?? "(감지 안 됨 — 개인 기억)"}`,
          });
          return true;
        case "/clear":
          // Static 은 append-only 라 상태만 비우면 스크롤백이 남는다 → 화면 클리어 후 턴 비우기.
          clearScreen();
          clearTurns();
          return true;
        case "/help":
          addTurn({
            kind: "note",
            text: "명령어: /model 모델 변경 · /reset 새 세션 · /project 프로젝트 · /clear 화면 비우기 · /quit 종료",
          });
          return true;
        default:
          return false;
      }
    },
    [
      projectContext,
      addTurn,
      resetSession,
      clearTurns,
      clearScreen,
      setModel,
      openModelPicker,
      exit,
    ],
  );
}
