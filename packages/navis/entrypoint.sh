#!/bin/sh
# Railway 볼륨은 root 소유로 마운트되어, 비-root(app) 프로세스가 그 안에 쓰지 못한다.
# 컨테이너는 root 로 시작해 볼륨/저장 디렉터리 소유권을 app 에게 넘긴 뒤,
# su-exec 로 권한을 app 으로 떨어뜨려 실제 앱(node)을 실행한다.
set -e

if [ -n "$DESKTOP_DIR" ]; then
  mkdir -p "$DESKTOP_DIR" 2>/dev/null || true
  chown -R app:app "$DESKTOP_DIR" 2>/dev/null || true
fi

# iOS .ipa 배포 디렉터리도 동일하게 보정 — 볼륨은 root 소유라 명시적 chown 없이는
# app 프로세스가 /data 하위에 폴더를 못 만든다(EACCES). DESKTOP_DIR 와 같은 처리.
if [ -n "$IOS_DIR" ]; then
  mkdir -p "$IOS_DIR" 2>/dev/null || true
  chown -R app:app "$IOS_DIR" 2>/dev/null || true
fi

exec su-exec app "$@"
