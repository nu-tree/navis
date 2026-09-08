import { CronExpressionParser } from "cron-parser";

// ── "지금 발동해야 하나?" 판정 ───────────────────────────────────────────────
// node-cron 은 상주 프로세스가 타이머를 들고 있다가 시각이 되면 콜백을 부르는 모델이다.
// 서버리스에는 그 타이머를 들고 있을 프로세스가 없다. 대신 외부 트리거가 주기적으로
// 틱을 치고, 우리가 매 틱마다 "직전 예정 발동시각"을 계산해 마지막 실행과 비교한다.
//
//   직전 발동시각(prevFire) = 크론식이 now 이전에 마지막으로 가리킨 시각
//   lastRun < prevFire  →  그 발동을 아직 아무도 실행하지 않았다 → 실행 대상
//
// 이 방식은 틱이 몇 번 빠져도(트리거 지연·장애) 다음 틱에서 밀린 발동을 한 번 잡아준다.
// 반대로 틱이 촘촘히 여러 번 들어와도 prevFire 가 같으므로 클레임에서 한 번만 통과한다.
// 정확한 시각 발동은 포기하는 셈이다 — 틱 간격만큼 늦게 돌 수 있다(트리거 간격이 곧 해상도).

export function prevFireTime(expression: string, timezone: string, now = new Date()): Date | undefined {
  try {
    const it = CronExpressionParser.parse(expression, {
      currentDate: now,
      tz: timezone || "Asia/Seoul",
    });
    return it.prev().toDate();
  } catch (err) {
    console.error(`[scheduler] 크론식 해석 실패: '${expression}' (${timezone})`, err);
    return undefined;
  }
}

// 크론식이 유효한지 — 등록/수정 시 입력 검증에 쓴다(node-cron 의 validate 대체).
export function isValidCron(expression: string): boolean {
  try {
    CronExpressionParser.parse(expression);
    return true;
  } catch {
    return false;
  }
}

// lastRun 이 직전 발동시각보다 이전이면 발동 대상. 반환값은 그 발동시각(클레임 조건에 쓴다).
export function dueFireTime(
  expression: string,
  timezone: string,
  lastRun: Date | null,
  now = new Date(),
): Date | undefined {
  const prev = prevFireTime(expression, timezone, now);
  if (!prev) return undefined;
  if (lastRun && lastRun >= prev) return undefined;
  return prev;
}
