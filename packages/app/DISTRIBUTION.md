# navis-app 배포/설치 가이드

전략: **무료 SideStore 설치 + OTA(expo-updates) 자동 업데이트.** ($99 Apple
개발자 계정 없이. 푸시 알림만 불가 → ntfy/데스크톱으로 대체.)

핵심 원리:
- **최초 1회만** Xcode 로 `.ipa` 빌드 → SideStore 로 폰 설치.
- **이후 코드(JS) 변경**은 `eas update`(OTA)로 자동 반영 — Xcode·재설치 불필요.
- **7일 재서명**은 SideStore 가 폰에서 자동 처리(맥 상시 불필요).
- Xcode 는 빌드 후 삭제해도 됨. 네이티브 모듈을 새로 추가할 때만 다시 필요.

---

## 0. 사전: Expo/EAS 셋업 (OTA용, 한 번)

```bash
cd packages/app
npx eas login              # Expo 계정 (없으면 expo.dev/signup)
npx eas init               # EAS 프로젝트 생성 → app.json 에 projectId/updates.url 기록
npx eas update:configure   # OTA 설정 마무리
```

## 1. iOS — 최초 설치 (SideStore)

### 1-1. Xcode 로 `.ipa` 빌드 (맥, 한 번)
```bash
# App Store 에서 Xcode 설치 후
cd packages/app
npx expo prebuild -p ios --clean     # ios/ 네이티브 프로젝트 생성
```
Xcode 로 `ios/navis.xcworkspace` 열기:
1. 프로젝트 타깃 → **Signing & Capabilities** → Team 을 본인 **무료 Apple ID(Personal Team)** 로
2. 상단 타깃을 **Any iOS Device** 로 두고 **Product → Build** (또는 Archive)
3. 빌드된 `Navis.app` 을 `.ipa` 로 포장:
   ```bash
   # DerivedData 또는 Archive 산출물에서 Navis.app 위치 확인 후
   mkdir -p Payload && cp -R /path/to/Navis.app Payload/
   zip -r navis.ipa Payload && rm -rf Payload
   ```
   (SideStore 가 어차피 본인 Apple ID 로 재서명하므로 서명은 신경 X)

### 1-2. SideStore 로 폰에 설치 (한 번)
1. https://sidestore.io 가이드대로 폰에 **SideStore** 설치 + 페어링
2. `navis.ipa` 를 폰으로(AirDrop) → SideStore 에서 열어 설치
3. 끝. 이후 7일 재서명은 SideStore 가 자동.

> Xcode 는 여기까지 쓰고 **삭제해도 됨**(디스크 회수).

## 2. 이후 업데이트 (OTA — Xcode 불필요)

JS/화면/로직만 바꿨다면:
```bash
cd packages/app
npx eas update --branch preview --message "무엇을 바꿨는지"
```
→ 설치된 앱이 **다음 실행 때 자동 다운로드/반영**.

**Xcode 재빌드가 필요한 경우**(드묾): 네이티브 모듈 추가, app.json 의 네이티브
설정(아이콘·권한·플러그인) 변경. 이때만 1번을 다시.

## 3. 백엔드(.env)
빌드/실행 전 `packages/app/.env` 에 `EXPO_PUBLIC_NAVIS_URL` / `EXPO_PUBLIC_NAVIS_TOKEN`
설정돼 있어야 navis 와 연결됨. (`.env.example` 참고)
