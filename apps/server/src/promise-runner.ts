// 약속 실행기 — 한 번에 하나씩, 대화가 먼저(specs/003 R4).
//
// ★ 프로세스 로컬 큐다. 인스턴스가 하나라(헌장 배포 절) DB 큐가 얻는 것이 없다. 진행 중 턴의
//   AbortController 가 이 프로세스에 있는 것과 같은 이유다.
// ★ 한 번에 하나: Agent SDK 는 턴마다 서브프로세스를 띄운다. 약속 턴을 병렬로 돌리면 server 메모리(1Gi)가
//   위험하다. 최악의 동시 실행을 "대화 턴 N + 약속 턴 1"로 묶는다.
// ★ 대화가 먼저: 실행 직전에 그 회원의 대화 턴이 끝나길 기다린다. 약속은 조금 늦어도 된다(사용자 결정).
//   반대로 대화 턴은 약속을 기다리지 않는다.

import { promise } from "@navis/domain";
import * as turns from "./turns";

/** 대화가 아주 길어져도 약속이 영영 밀리지 않게, 이만큼 기다린 뒤엔 그냥 실행한다. */
const YIELD_TIMEOUT_MS = 10 * 60 * 1000;

// 직렬화 꼬리와 수락 여부. `let` 대신 상수 객체의 필드를 바꾼다(헌장 IV — 프라미스 직렬화 큐).
const queue: { tail: Promise<unknown>; accepting: boolean } = {
  tail: Promise.resolve(),
  accepting: true,
};

/** 선점한 회차를 줄 끝에 세운다. 결과는 실행이 끝나면 풀린다. 던지지 않는다. */
export const enqueue = (run: promise.ClaimedRun): Promise<promise.RunResult> => {
  const job = queue.tail.then(async () => {
    await turns.waitUntilIdle(run.promise.userId, YIELD_TIMEOUT_MS);
    return promise.executeRun(run);
  });
  queue.tail = job.catch(() => undefined);
  return job;
};

export const isAccepting = () => queue.accepting;

/**
 * 종료 신호를 받으면 새 선점을 멈춘다(research R3). 진행 중인 실행은 마저 돈다 — 배포 때 Cloud Run 은
 * 처리 중인 요청을 끝까지 마치게 둔다. 그래도 끊기면 임대가 만료된 뒤 다음 tick 이 다시 집는다.
 */
export const stopAccepting = () => {
  queue.accepting = false;
};

/** 줄에 선 실행이 모두 끝나면 풀린다. 종료 직전에 기다린다. */
export const drain = (): Promise<unknown> => queue.tail;
