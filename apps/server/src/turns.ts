// 진행 중인 대화 턴 — 방과 회원을 함께 기록한다(specs/003 R4).
//
// 예전엔 routes/chat.ts 안의 `activeConversations: Set<방 id>` 였다. 약속 실행이 "이 회원이 지금
// 대화 중인가"를 알아야 해서 회원을 함께 두고 모듈로 뺐다. 상주 서버 · 인스턴스 하나라 프로세스
// 로컬 Map 으로 충분하다(chat.ts 의 inFlight 주석과 같은 이유).

const active = new Map<string, string>(); // 방 id → 회원 id
const idleWaiters = new Map<string, Set<() => void>>(); // 회원 id → 대화가 끝나길 기다리는 쪽

/** 턴 시작. 같은 방에 이미 진행 중이면 false — 클라이언트도 막지만 새로고침으로 우회된다(FR-008). */
export const begin = (conversationId: string, userId: string): boolean => {
  if (active.has(conversationId)) return false;
  active.set(conversationId, userId);
  return true;
};

export const isUserBusy = (userId: string): boolean => [...active.values()].includes(userId);

export const end = (conversationId: string): void => {
  const userId = active.get(conversationId);
  active.delete(conversationId);
  if (!userId || isUserBusy(userId)) return;
  for (const wake of idleWaiters.get(userId) ?? []) wake();
  idleWaiters.delete(userId);
};

/**
 * 이 회원의 대화 턴이 모두 끝날 때까지 기다린다. 대화가 먼저다 — 약속은 조금 늦어도 된다.
 * 타임아웃이 지나면 그냥 풀린다. 대화가 아주 길어져도 약속이 영영 밀리지 않게.
 */
export const waitUntilIdle = (userId: string, timeoutMs: number): Promise<void> => {
  if (!isUserBusy(userId)) return Promise.resolve();
  return new Promise((resolve) => {
    const waiters = idleWaiters.get(userId) ?? new Set<() => void>();
    const wake = () => {
      clearTimeout(timer);
      waiters.delete(wake);
      resolve();
    };
    const timer = setTimeout(wake, timeoutMs);
    waiters.add(wake);
    idleWaiters.set(userId, waiters);
  });
};
