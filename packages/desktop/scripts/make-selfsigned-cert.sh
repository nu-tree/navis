#!/usr/bin/env bash
# navis 데스크톱 macOS 자가서명(self-signed) 코드서명 인증서 — 한 번만 실행.
#
# 왜: macOS 자동업데이트(Squirrel.Mac)는 "설치된 앱 서명 == 새 버전 서명"이 일치해야만
# 교체를 수행한다. 미서명/ad-hoc 은 빌드마다 신원이 달라져 거부 → 수동 다운로드로 폴백.
# 유료 Apple Developer 인증서 없이도 "빌드마다 동일한 자가서명 인증서"만 있으면 자동설치가 된다.
# (Gatekeeper 경고는 남지만 그건 *최초 1회* 우클릭→열기 뿐, 이후 업데이트는 완전 자동.)
#
# 이 스크립트가 하는 일:
#   1) codeSigning 용 자가서명 인증서 + 개인키를 만든다(CN = "navis self-signed", 10년).
#   2) 로컬 login 키체인에 넣는다 → `pnpm dist:mac` 로컬 빌드도 이 인증서로 서명됨.
#   3) CI(GitHub Actions)용 .p12 를 base64 로 출력 → 레포 Secret 2개로 등록하면 끝.
#
# 사용: bash packages/desktop/scripts/make-selfsigned-cert.sh
set -euo pipefail

# 진짜 OpenSSL 3.x 를 고른다. macOS /usr/bin/openssl 은 LibreSSL 이라 -addext/-legacy 미지원.
OPENSSL="openssl"
for cand in /opt/homebrew/opt/openssl@3/bin/openssl /usr/local/opt/openssl@3/bin/openssl "$(command -v openssl || true)"; do
  if [ -x "$cand" ] && "$cand" version 2>/dev/null | grep -qi "^OpenSSL 3"; then OPENSSL="$cand"; break; fi
done
if ! "$OPENSSL" version 2>/dev/null | grep -qi "^OpenSSL 3"; then
  echo "✗ OpenSSL 3.x 가 필요하다(LibreSSL 불가). 'brew install openssl@3' 후 다시 실행." >&2
  exit 1
fi
echo "▶ openssl: $("$OPENSSL" version) ($OPENSSL)"

CN="navis self-signed"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
KEY="$WORKDIR/key.pem"
CRT="$WORKDIR/cert.pem"
P12="$WORKDIR/navis-cert.p12"
# .p12 보호용 임시 비밀번호(랜덤). CI Secret(MAC_CSC_KEY_PASSWORD)로 같이 등록한다.
PW="$("$OPENSSL" rand -hex 16)"

echo "▶ 자가서명 코드서명 인증서 생성 (CN=$CN)…"
"$OPENSSL" req -x509 -newkey rsa:2048 -keyout "$KEY" -out "$CRT" -days 3650 -nodes \
  -subj "/CN=$CN" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1

"$OPENSSL" pkcs12 -export -legacy -out "$P12" -inkey "$KEY" -in "$CRT" \
  -name "$CN" -passout "pass:$PW" >/dev/null 2>&1

LOGIN_KC="$HOME/Library/Keychains/login.keychain-db"
echo "▶ 로컬 login 키체인에 등록 (로컬 dist:mac 빌드용)…"
# 기존 동명 인증서가 있으면 정리(중복 신원 방지). 실패해도 무시.
security delete-certificate -c "$CN" "$LOGIN_KC" >/dev/null 2>&1 || true
security import "$P12" -k "$LOGIN_KC" -P "$PW" \
  -T /usr/bin/codesign -T /usr/bin/security >/dev/null 2>&1
# codesign 이 프롬프트 없이 키를 쓰도록 ACL 허용(있으면).
security set-key-partition-list -S apple-tool:,apple:,codesign: \
  -k "" "$LOGIN_KC" >/dev/null 2>&1 || true

# 자가서명은 "코드서명용으로 trust" 돼야 codesign 이 신원으로 인정한다(안 그러면 no identity found).
# system 키체인에 신뢰 루트로 등록 → 관리자 암호 1회 입력 프롬프트가 뜬다.
#   (되돌리려면: 키체인 접근.app 에서 'navis self-signed' 삭제, 또는
#    sudo security remove-trusted-cert -d "<cert.pem>")
echo "▶ 코드서명 신뢰 등록 (system 키체인) — 관리자 암호를 물어볼 수 있음…"
security find-certificate -c "$CN" -p "$LOGIN_KC" > "$WORKDIR/trust.pem"
if sudo security add-trusted-cert -d -r trustRoot -p codeSign \
     -k /Library/Keychains/System.keychain "$WORKDIR/trust.pem"; then
  echo "  ✓ 신뢰 등록 완료"
else
  echo "  ⚠ 신뢰 등록을 건너뜀 → 로컬 dist:mac 서명은 안 될 수 있음(CI 빌드엔 영향 없음)."
fi

P12_B64="$(base64 < "$P12" | tr -d '\n')"

echo ""
echo "✅ 완료. 로컬 키체인+신뢰 등록됨 → 이제 'pnpm --filter navis-desktop dist:mac' 가 서명된 앱을 만든다."
echo "   (확인: security find-identity -v -p codesigning 에 'navis self-signed' 가 보이면 정상)"
echo ""
echo "── 다음: GitHub 레포 Secret 2개만 등록하면 CI 도 서명된다 ──"
echo ""
if command -v gh >/dev/null 2>&1; then
  echo "gh 가 있으니 아래 두 줄을 그대로 실행하면 등록 완료:"
  echo ""
  echo "  printf '%s' '$P12_B64' | gh secret set MAC_CSC_LINK"
  echo "  printf '%s' '$PW' | gh secret set MAC_CSC_KEY_PASSWORD"
else
  echo "레포 Settings → Secrets and variables → Actions 에 추가:"
  echo ""
  echo "  MAC_CSC_LINK         = (아래 base64 한 줄 전체)"
  echo "  MAC_CSC_KEY_PASSWORD = $PW"
  echo ""
  echo "  --- MAC_CSC_LINK ---"
  echo "$P12_B64"
  echo "  --- /MAC_CSC_LINK ---"
fi
echo ""
echo "⚠ base64/비밀번호는 화면 밖으로 새지 않게 하고, 등록 후 터미널 스크롤백을 지워라."
