// 선제 보고(크론/다이제스트/캘린더) 로그. 앱(navis-app)이 /api/reports 로 폴링해
// 보고 전용 방에 표시한다. 내용 영속은 namory(DB)의 settings KV(key="reports")에 둔다 —
// 서버가 재시작해도 보고 내용이 사라지지 않도록(이전엔 인메모리라 재시작 시 증발해
// 앱에선 "방은 있는데 내용이 빈" 증상이 났다). system-prompt.ts·connectors 와 동일 패턴.
//
// sourceId/sourceTitle 로 "출처별 방"을 만든다. 크론은 크론마다 방 1개(sourceId=크론 id,
// sourceTitle=크론 DB 제목), 다이제스트/캘린더는 각각 고정 방.
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
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
const seq = { n: 0 };

// --- namory KV 영속화 (system-prompt.ts 와 동일 패턴) ---
const BASE = config.namoryMcpUrl.replace(/\/mcp\/?$/, "");
const auth = { Authorization: `Bearer ${config.namoryToken}` };
const KEY = "reports";

let loaded = false; // loadReports 시작됨(중복 호출 방지)
let ready = false; // 복원 완료 — 그 전엔 저장 보류(DB 를 빈 버퍼로 덮어쓰지 않게)
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving = false; // PUT 진행 중 — 직렬화로 쓰기 순서 역전 방지
let dirty = false; // PUT 중 새 보고가 들어옴 → 끝나면 최신 BUFFER 로 1회 더 저장

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

// 부팅 시 1회: DB 에 저장된 보고를 BUFFER 로 복원한다. 복원 전 들어온 보고(스케줄러가
// 먼저 발동했을 수 있음)와 id 로 병합하고, createdAt 오름차순 정렬 후 MAX 로 캡.
export async function loadReports(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const res = await fetch(`${BASE}/settings/${KEY}`, {
      headers: auth,
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { value?: string | null };
      const raw = (data.value ?? "").trim();
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        const stored = Array.isArray(parsed)
          ? parsed.map(normalize).filter((r): r is Report => !!r)
          : [];
        const seen = new Set(BUFFER.map((r) => r.id));
        for (const r of stored) if (!seen.has(r.id)) BUFFER.push(r);
        BUFFER.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        if (BUFFER.length > MAX) BUFFER.splice(0, BUFFER.length - MAX);
        // 복원 도중 recordReport 가 먼저 발동했을 수 있어 seq.n 을 무작정 덮어쓰면
        // 이미 발급된 카운터가 되감겨 id 충돌이 난다. 더 큰 값을 유지.
        seq.n = Math.max(seq.n, BUFFER.length);
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
  // 직렬화: 이미 PUT 이 진행 중이면 dirty 만 세우고 끝낸다. 진행 중인 PUT 이
  // 완료 후 최신 BUFFER 로 1회 더 저장해, 쓰기 순서 역전·마지막 쓰기 유실을 막는다.
  if (saving) {
    dirty = true;
    return;
  }
  saving = true;
  try {
    do {
      dirty = false;
      const res = await fetch(`${BASE}/settings/${KEY}`, {
        method: "PUT",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(BUFFER) }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error(`[reports] 저장 실패(무시): ${res.status}`);
    } while (dirty); // PUT 중 들어온 변경이 있으면 최신 스냅샷으로 다시 저장
  } catch (err) {
    console.error("[reports] 저장 실패(무시):", err);
  } finally {
    saving = false;
  }
}

export function recordReport(input: RecordReportInput): void {
  seq.n += 1;
  // id 는 randomUUID 기반 — Date.now() 만으론 같은 ms 안에서 충돌 가능. seq 까지 같이
  // 묶어 디버그 시 발생 순서를 식별 가능하게 한다.
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
