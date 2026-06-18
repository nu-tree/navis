// 데스크톱 서빙 모듈 공통 상수.
// 보관 디렉터리(DIR)와 설치파일 확장자별 content-type(MIME)을 한 곳에 모아
// upload/list/file 등 여러 핸들러가 공유한다.
import { resolve } from "node:path";
import { config } from "../../config.js";

// 설치파일이 저장되는 절대 경로(= Railway 볼륨 등 config.desktopDir).
export const DIR = resolve(config.desktopDir);

// 설치파일 확장자별 content-type (브라우저가 바로 다운로드하도록).
export const MIME: Record<string, string> = {
  ".dmg": "application/x-apple-diskimage",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".zip": "application/zip",
  ".appimage": "application/octet-stream",
  ".yml": "text/yaml; charset=utf-8",
  ".blockmap": "application/octet-stream",
};
