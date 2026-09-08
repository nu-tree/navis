#!/bin/sh
# 컨테이너는 root 로 시작해 su-exec 로 권한을 app 으로 떨어뜨린 뒤 실제 앱(node)을 실행한다.
set -e

exec su-exec app "$@"
