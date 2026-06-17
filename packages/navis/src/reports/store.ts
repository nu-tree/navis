// 선제 보고(크론/다이제스트/캘린더) 로그. 앱(navis-app)이 /api/reports 로 폴링해
// 보고 전용 방에 표시한다. 내용 영속은 namory(DB)의 settings KV(key="reports")에 둔다 —
// 서버가 재시작해도 보고 내용이 사라지지 않도록(이전엔 인메모리라 재시작 시 증발해
// 앱에선 "방은 있는데 내용이 빈" 증상이 났다). system-prompt.ts·connectors 와 동일 패턴.
//
// sourceId/sourceTitle 로 "출처별 방"을 만든다. 크론은 크론마다 방 1개(sourceId=크론 id,
// sourceTitle=크론 DB 제목), 다이제스트/캘린더는 각각 고정 방.
import { randomUUID } from "node:crypto";
import { namoryFetch } from "../namory-client.js";
import { publishToNtfy } from "./ntfy.js";

export type Report = {
  id: string;
  type: string; // logTag: "cron" | "calendar" | "digest" | ...
  sourceId: string; // 방 라우팅 키 (크론 id / "digest" / "calendar")
  sourceTitle: string; // 방 제목 (DB 기반)
  text: string;
  createdAt: string; // ISO 8601
};

export type RecordReportInput = {
  type: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
};

const BUFFER: Report[] = [];
const MAX = 200;
// seq.n 은 "지금까지 발급한 보고의 누적 순번" — BUFFER 길이와 무관하게 단조 증가.
// 캡(MAX) 도달 후에도 splice 로 앞이 잘려나가지만 seq.n 은 줄지 않는다(발행 순서 식별
// 목적 보존). namory(DB)에 BUFFER 와 함께 영속해, 재기동 후에도 카운터가 이어진다.
const seq = { n: 0 };

const KEY = "reports";

let loaded = false; // loadReports 시작됨(중복 호출 방지)
let ready = false; // 복원 완료 — 그 전엔 저장 보류(DB 를 빈 버퍼로 덮어쓰지 않게)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false; // PUT 진행 중 — 직렬화로 쓰기 순서 역전 방지
let dirty = false; // PUT 중 새 보고가 들어옴 → 끝나면 최신 BUFFER 로 1회 더 저장
// 진행 중인 saveReports() 의 끝을 기다리고 싶을 때(특히 graceful shutdown) 잡는 참조.
let inflight: Promise<void> | undefined;

// 임의 객체 → Report(유효하면). 깨진 항목은 버린다(반쪽 데이터로 전체가 죽지 않게).
function normalize(item: unknown): Report | undefined {
  if (!item || typeof item !== "object") return undefined;
  const o = item as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const text = typeof o.text === "string" ? o.text : "";
  const sourceId = typeof o.sourceId === "string" ? o.sourceId : "";
  const sourceTitle = typeof o.sourceTitle === "string" ? o.sourceTitle : "";
  const createdAt = typeof o.createdAt === "string" ? o.createdAt : "";
  const type = typeof o.type === "string" ? o.type : "";
  if (!id || !sourceId || !createdAt) return undefined;
  return { id, type, sourceId, sourceTitle, text, createdAt };
}

// 저장 형식은 두 가지를 모두 받는다(하위 호환):
//   - 신규: { seq: number, items: Report[] }
//   - 레거시: Report[]  (구버전 navis 가 저장해둔 데이터)
// 신규 형식이 우선이며, 저장 시엔 항상 신규 형식으로 쓴다.
type StoredShape = { seq?: number; items?: unknown[] } | unknown[];

function parseStored(raw: string): { seq: number; items: Report[] } {
  try {
    const parsed = JSON.parse(raw) as StoredShape;
    if (Array.isArray(parsed)) {
      const items = parsed.map(normalize).filter((r): r is Report => !!r);
      return { seq: items.length, items };
    }
    if (parsed && typeof parsed === "object") {
      const items = Array.isArray(parsed.items)
        ? parsed.items.map(normalize).filter((r): r is Report => !!r)
        : [];
      const s = typeof parsed.seq === "number" && Number.isFinite(parsed.seq) ? parsed.seq : 0;
      return { seq: s, items };
    }
  } catch {
    /* 파싱 실패 → 빈 상태로 진행. 다음 저장이 새 JSON 으로 덮어쓴다. */
  }
  return { seq: 0, items: [] };
}

// 부팅 시 1회: DB 에 저장된 보고를 BUFFER 로 복원한다. 복원 전 들어온 보고(스케줄러가
// 먼저 발동했을 수 있음)와 id 로 병합하고, createdAt 오름차순 정렬 후 MAX 로 캡.
export async function loadReports(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await namoryFetch(`/settings/${KEY}`);
    if (res.ok) {
      const data = (await res.json()) as { value?: string | null };
      const raw = (data.value ?? "").trim();
      if (raw) {
        const { seq: storedSeq, items: stored } = parseStored(raw);
        const seen = new Set(BUFFER.map((r) => r.id));
        for (const r of stored) if (!seen.has(r.id)) BUFFER.push(r);
        BUFFER.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
        // 복원 도중 recordReport 가 먼저 발동했을 수 있어 seq.n 을 무작정 덮어쓰면
        // 이미 발급된 카운터가 되감겨 id 충돌이 난다. 더 큰 값을 유지.
        // BUFFER.length 가 아닌 영속화된 storedSeq 를 기준으로 한다 — 캡 이후에도
        // 단조 증가(발행 순서 식별) 보장.
        seq.n = Math.max(seq.n, storedSeq);
      }
    }
  } catch (err) {
    console.error("[reports] 복원 실패(무시):", err);
  } finally {
    // 복원 완료 — 이제부터 저장 허용. 복원 중 들어온 보고가 있으면 병합본을 영속.
    ready = true;
    if (BUFFER.length > 0) scheduleSave();
  }
}

// BUFFER 를 DB 에 저장(디바운스). 버스트 발동 시 마지막 1회만 PUT.
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    void saveReports();
  }, 1_000);
}

async function saveReports(): Promise<void> {
  // 복원 전엔 저장 보류 — 빈/부분 버퍼로 DB 의 기존 보고를 덮어쓰지 않게.
  if (!ready) return;
  // 직렬화: 이미 PUT 이 진행 중이면 dirty 만 세우고 진행 중 사이클의 종료를 기다린다.
  // 진행 중인 PUT 의 do/while 루프가 dirty 를 다시 보고 최신 BUFFER 로 한 번 더 저장하므로
  // 호출부(특히 flushReports)는 inflight 가 끝나면 더는 기다릴 필요가 없다.
  if (saving) {
    dirty = true;
    if (inflight) await inflight;
    return;
  }
  saving = true;
  const run = (async () => {
    try {
      do {
        dirty = false;
        // 영속 포맷: { seq, items } — 캡 이후에도 단조 증가하는 seq 를 함께 저장.
        const snapshot = JSON.stringify({ seq: seq.n, items: BUFFER });
        const res = await namoryFetch(`/settings/${KEY}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: snapshot }),
        });
        if (!res.ok) console.error(`[reports] 저장 실패(무시): ${res.status}`);
      } while (dirty); // PUT 중 들어온 변경이 있으면 최신 스냅샷으로 다시 저장
    } catch (err) {
      console.error("[reports] 저장 실패(무시):", err);
    } finally {
      saving = false;
    }
  })();
  inflight = run;
  try {
    await run;
  } finally {
    if (inflight === run) inflight = undefined;
  }
}

// SIGTERM/SIGINT 등으로 즉시 종료해야 할 때 — 디바운스 타이머를 취소하고
// 진행 중인 PUT 의 종료를 기다린 뒤, 마지막 미저장 변경분을 한 번 더 동기 저장한다.
// (이전엔 디바운스 1초 안에 죽으면 마지막 보고가 in-memory 만 있다가 통째로 유실됐다.)
export async function flushReports(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = undefined;
  }
  // 진행 중인 PUT 이 있으면 그 do/while 루프가 dirty 를 모두 소진할 때까지 대기.
  if (inflight) {
    try {
      await inflight;
    } catch {
      /* saveReports 가 자체적으로 로그함 */
    }
  }
  // 타이머 취소로 흘려보낸 마지막 변경분이 있을 수 있다 — 한 번 더 직렬 저장.
  await saveReports();
}

// process 신호 핸들러는 단 한 번만 등록(테스트가 모듈을 재import 해도 핸들러가 쌓이지 않게).
let signalsBound = false;
function bindShutdownHandlers(): void {
  if (signalsBound) return;
  signalsBound = true;
  let shuttingDown = false;
  const onSignal = (sig: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    // 5초 안엔 끝내자 — Railway 의 graceful kill 윈도우보다 짧게.
    const guard = setTimeout(() => {
      console.error(`[reports] flush 가 5초를 넘김 — 강제 종료`);
      process.exit(0);
    }, 5_000);
    guard.unref();
    flushReports()
      .catch((err) => console.error("[reports] flush 실패:", err))
      .finally(() => {
        clearTimeout(guard);
        // 원래의 종료 흐름을 막지 않도록 기본 동작과 동일하게 종료한다.
        process.kill(process.pid, sig);
      });
  };
  // once: 두 번째 SIGTERM 은 기본 동작(즉시 종료)이 그대로 먹게.
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
}
bindShutdownHandlers();

export function recordReport(input: RecordReportInput): void {
  seq.n += 1;
  // id 는 randomUUID 기반 — Date.now() 만으론 같은 ms 안에서 충돌 가능. seq 까지 같이
  // 묶어 디버그 시 발생 순서를 식별 가능하게 한다(BUFFER 캡 이후에도 단조 증가).
  BUFFER.push({
    id: `r${seq.n}-${randomUUID()}`,
    ...input,
    createdAt: new Date().toISOString(),
  });
  if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
  scheduleSave(); // DB 영속(디바운스) — 서버 재시작에도 내용 유지
  // 모든 보고를 폰으로 푸시(NTFY_TOPIC 설정 시에만). 데스크톱/웹은 기존 폴링 알림 유지.
  publishToNtfy(input.sourceTitle, input.text);
}

// since(ISO) 이후 보고만. 없으면 전체.
export function getReports(since?: string): Report[] {
  if (!since) return [...BUFFER];
  return BUFFER.filter((r) => r.createdAt > since);
}
