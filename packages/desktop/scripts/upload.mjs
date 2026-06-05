// 빌드 산출물(release/)을 navis(Railway)로 업로드한다. GitHub Releases/PAT 대체.
// 각 설치파일·채널파일을 PUT /api/desktop/upload?name=<파일> 로 올린다(Bearer 토큰).
//
// 필요 env:
//   NAVIS_URL    navis 베이스 URL (예: https://navis.up.railway.app)
//   NAVIS_TOKEN  navis APP_API_TOKEN 과 동일 값
import { readdir, readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const NAVIS_URL = (process.env.NAVIS_URL ?? "").replace(/\/+$/, "");
const NAVIS_TOKEN = process.env.NAVIS_TOKEN ?? "";
if (!NAVIS_URL || !NAVIS_TOKEN) {
  console.error("[upload] NAVIS_URL / NAVIS_TOKEN 미설정 — 업로드 건너뜀.");
  process.exit(0); // 시크릿 없으면 실패가 아니라 조용히 스킵
}

// release/ 에서 올릴 파일만 추린다(설치파일 + 자동업데이트 채널/블록맵).
const RELEASE = join(dirname(fileURLToPath(import.meta.url)), "..", "release");
const KEEP = /\.(dmg|exe|appimage|zip|yml|blockmap)$/i;

const names = await readdir(RELEASE).catch(() => {
  console.error(`[upload] ${RELEASE} 없음 — 빌드 먼저.`);
  process.exit(1);
});

const targets = [];
for (const n of names) {
  if (!KEEP.test(n)) continue;
  const s = await stat(join(RELEASE, n));
  if (s.isFile()) targets.push(n);
}
if (!targets.length) {
  console.error("[upload] 올릴 파일이 없음.");
  process.exit(1);
}

for (const name of targets) {
  const body = await readFile(join(RELEASE, name));
  const url = `${NAVIS_URL}/api/desktop/upload?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${NAVIS_TOKEN}`, "content-type": "application/octet-stream" },
    body,
  });
  if (!res.ok) {
    console.error(`[upload] 실패 ${name} → ${res.status} ${await res.text().catch(() => "")}`);
    process.exit(1);
  }
  console.log(`[upload] OK ${name} (${(body.length / 1048576).toFixed(1)} MB)`);
}
console.log(`[upload] 완료 — ${targets.length}개 파일 → ${NAVIS_URL}`);

// 업로드가 끝나면 플랫폼별 옛 버전 설치파일을 정리(최신만 유지).
const pruneRes = await fetch(`${NAVIS_URL}/api/desktop/prune`, {
  method: "POST",
  headers: { Authorization: `Bearer ${NAVIS_TOKEN}` },
});
if (pruneRes.ok) {
  const { deleted } = await pruneRes.json().catch(() => ({ deleted: [] }));
  console.log(
    deleted?.length ? `[prune] 옛 버전 ${deleted.length}개 삭제 — ${deleted.join(", ")}` : "[prune] 삭제할 옛 버전 없음",
  );
} else {
  // 정리는 부가 작업 — 실패해도 릴리스 자체는 성공으로 둔다.
  console.warn(`[prune] 정리 실패 ${pruneRes.status} (무시)`);
}
