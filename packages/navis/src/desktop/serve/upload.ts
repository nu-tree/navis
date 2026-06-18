// 데스크톱 빌드 업로드 핸들러.
// GitHub Actions 가 빌드한 .dmg/.exe + latest*.yml 를 받아 DIR 에 저장한다.
// 실제 인증·스트림·abort/부분파일 정리는 dist/upload-util.ts 의 공통 헬퍼가 담당한다.
import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../../config.js";
import { handleStreamUpload } from "../../dist/upload-util.js";
import { DIR } from "./shared.js";

// PUT/POST /api/desktop/upload?name=<파일> — Actions 가 빌드 산출물을 올린다.
export async function handleDesktopUpload(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  await handleStreamUpload(req, res, url, {
    dir: DIR,
    tag: "desktop",
    configured: !!config.appApiToken,
    notConfiguredError: "desktop dist not configured",
    mkdirHint:
      "DESKTOP_DIR 가 쓰기 가능한 경로인지 확인. Railway면 그 경로에 볼륨이 마운트돼 있어야 함.",
  });
}
