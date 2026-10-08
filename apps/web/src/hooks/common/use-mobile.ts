import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

// 미디어 쿼리는 React 밖의 상태다. useSyncExternalStore 로 구독하면 effect 안에서
// setState 를 부르지 않아도 되고, 연쇄 렌더가 생기지 않는다.
const subscribe = (onStoreChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// 서버 렌더에는 창이 없다. 데스크톱으로 가정하고, hydration 이 실제 값으로 맞춘다.
const getServerSnapshot = () => false;

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
