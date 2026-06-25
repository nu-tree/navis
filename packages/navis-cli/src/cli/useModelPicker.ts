import { useCallback, useState } from "react";
import type { Key } from "ink";
import { MODEL_OPTIONS } from "./models.js";
import type { TurnInput } from "./types.js";

// /model 모델 선택 모달의 상태 + 키 입력을 한 곳에. 열림 여부·강조 인덱스를 들고,
// 모달이 열린 동안의 ↑/↓·Enter(적용)·Esc(취소) 를 스스로 처리한다.
// App 은 active 로 모달을 그릴지 결정하고, 열린 동안 키를 handleKey 에 위임만 한다.
export function useModelPicker(
  model: string,
  setModel: (id: string) => void,
  addTurn: (turn: TurnInput) => void,
) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  // 현재 모델에 강조를 맞춰 모달을 연다.
  const open = useCallback(() => {
    const cur = MODEL_OPTIONS.findIndex((m) => m.id === model);
    setIndex(cur >= 0 ? cur : 0);
    setActive(true);
  }, [model]);

  // 모달이 열린 동안의 키 처리(항상 소비).
  const handleKey = useCallback(
    (key: Key) => {
      const n = MODEL_OPTIONS.length;
      if (key.upArrow) setIndex((i) => (i - 1 + n) % n);
      else if (key.downArrow) setIndex((i) => (i + 1) % n);
      else if (key.return) {
        const picked = MODEL_OPTIONS[index];
        setModel(picked.id);
        setActive(false);
        addTurn({ kind: "note", text: `모델 변경: ${picked.label}` });
      } else if (key.escape) {
        setActive(false);
        addTurn({ kind: "note", text: "모델 변경 취소" });
      }
    },
    [index, setModel, addTurn],
  );

  return { active, index, open, handleKey };
}
