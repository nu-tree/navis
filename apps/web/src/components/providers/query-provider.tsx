"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // BFF 는 같은 오리진이다. 실패가 일시적이면 한 번이면 충분하고, 세 번(기본값)을
        // 기다리면 오류 표시가 몇 초 늦어진다.
        retry: 1,
      },
    },
  });

export const QueryProvider = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  // 모듈 수준에 두지 않는다 — 서버 렌더에서 요청끼리 캐시를 나눠 갖게 된다.
  // 지연 초기화라 렌더마다 새로 만들지 않는다.
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
