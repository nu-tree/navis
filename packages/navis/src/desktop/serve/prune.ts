// 데스크톱 옛 버전 설치파일 정리(prune) 핸들러.
// 플랫폼별 최신 N개 버전만 남기고 오래된 설치파일(+blockmap)을 삭제한다.
import { readdir, unlink } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authed, parseVersion, compareVersion, safePath } from "../../dist/serve-utils.js";
import { DIR } from "./shared.js";

// POST /api/desktop/prune — 플랫폼별 최신 N개 버전만 남기고 옛 버전 설치파일(+blockmap)을 지운다.
// 릴리스 후 upload.mjs 가 모든 업로드를 마친 뒤 한 번 호출. 같은 아티팩트의 옛 버전이
// 쌓여 다운로드 페이지에 중복으로 보이거나 디스크를 먹는 걸 막는다.
//   - 그룹 키 = 파일명에서 버전(X.Y.Z)을 뺀 것. 예) Navis-0.1.5-arm64.dmg → "Navis--arm64.dmg".
//     같은 키 안에서 최신 KEEP_RECENT 개만 남기고 나머지 삭제(blockmap 도 함께 정리됨).
//   - 버전이 없는 파일(latest*.yml, builder-debug.yml 등)은 그룹에 안 들어가 항상 보존.
//
// 왜 1개가 아니라 N개? 릴리스가 짧은 간격으로 연달아 나면(예: 자동개선이 여러 커밋을
// 빠르게 머지), 사용자의 electron-updater 가 직전 버전을 받던 중에 그 파일이 즉시 삭제돼
// 다운로드가 404/체크섬 불일치로 깨진다("업데이트 실패"). 최근 몇 개를 남겨 이 레이스를 막는다.
const KEEP_RECENT = 3;
export async function handleDesktopPrune(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!authed(req, url)) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  try {
    const names = await readdir(DIR).catch(() => [] as string[]);

    // 버전 있는 파일만 "버전 제거 키"로 그룹핑.
    const groups = new Map<string, string[]>();
    for (const n of names) {
      if (!parseVersion(n)) continue;
      const key = n.replace(/\d+\.\d+\.\d+/, "");
      const arr = groups.get(key) ?? [];
      arr.push(n);
      groups.set(key, arr);
    }

    const deleted: string[] = [];
    for (const arr of groups.values()) {
      if (arr.length <= KEEP_RECENT) continue;
      // 버전 내림차순 정렬 후 최신 KEEP_RECENT 개는 보존, 나머지 삭제.
      const sorted = [...arr].sort((a, b) =>
        compareVersion(parseVersion(b) ?? "0.0.0", parseVersion(a) ?? "0.0.0"),
      );
      for (const n of sorted.slice(KEEP_RECENT)) {
        const p = safePath(DIR, n);
        if (!p) continue;
        try {
          await unlink(p);
          deleted.push(n);
        } catch (err) {
          console.error(`[desktop] prune 삭제 실패 ${n}:`, err);
        }
      }
    }

    if (deleted.length) console.log(`[desktop] prune: ${deleted.length}개 삭제 — ${deleted.join(", ")}`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ deleted }));
  } catch (err) {
    console.error("[desktop] prune 실패:", err);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "prune failed" }));
  }
}
