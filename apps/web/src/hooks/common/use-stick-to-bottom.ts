"use client";

import { useEffect, useRef } from "react";

/** 바닥에서 이만큼 안쪽이면 "바닥에 있다"로 본다 — 딱 0px 이면 반올림 오차로 자주 빠진다. */
const THRESHOLD_PX = 80;

/**
 * 내용이 늘면 바닥으로 따라 내려간다. 단, 사용자가 위로 올려 읽고 있으면 끌어내리지 않는다.
 *
 * ★ 즉시 스크롤한다(smooth 가 아니다). 스트리밍은 조각마다 내용이 늘어서, 부드러운 스크롤을
 *   매번 다시 걸면 앞선 애니메이션이 끝나기 전에 새로 시작돼 화면이 끊긴다. 애니메이션 도중의
 *   scroll 이벤트가 "바닥에서 멀다"로 읽혀 따라가기가 풀리는 문제도 함께 생긴다.
 *
 * @param deps 바뀌면 바닥으로 내린다 (메시지 목록, 스트리밍 중인 글 등)
 */
export const useStickToBottom = <T extends HTMLElement>(deps: readonly unknown[]) => {
  const ref = useRef<T>(null);
  // 처음엔 바닥에 붙어 있다.
  const stuck = useRef(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD_PX;
  };

  useEffect(() => {
    const el = ref.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
    // deps 는 호출부가 고른다 — 내용이 바뀌는 신호만 넘긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  /** 바닥으로 다시 붙인다. 사용자가 보낸 직후처럼, 읽던 위치와 상관없이 내려야 할 때. */
  const stick = () => {
    stuck.current = true;
  };

  return { ref, onScroll, stick };
};
