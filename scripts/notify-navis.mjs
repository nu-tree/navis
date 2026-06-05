#!/usr/bin/env node
// 작업 완료 보고를 navis 로 POST → 앱/데스크톱이 폴링해 맥 네이티브 알림으로 띄운다.
// (개발 머신의 Claude Code 가 작업을 끝냈을 때 사용자에게 알리는 용도)
//
// 사용:
//   node scripts/notify-navis.mjs "이미지 첨부 + 스트리밍 구현 완료 (커밋 abc1234)"
//   node scripts/notify-navis.mjs --title "🤖 빌드 완료" "release 업로드까지 끝남"
//
// 접속값은 env 우선, 없으면 packages/app/.env 의 EXPO_PUBLIC_NAVIS_URL/TOKEN 을 읽는다.
// (navis 의 APP_API_TOKEN == EXPO_PUBLIC_NAVIS_TOKEN)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFile(key) {
  try {
    const txt = readFileSync(join(root, 'packages/app/.env'), 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const url = (
  process.env.NAVIS_URL ||
  process.env.EXPO_PUBLIC_NAVIS_URL ||
  fromEnvFile('EXPO_PUBLIC_NAVIS_URL')
).replace(/\/+$/, '');
const token =
  process.env.NAVIS_TOKEN ||
  process.env.EXPO_PUBLIC_NAVIS_TOKEN ||
  fromEnvFile('EXPO_PUBLIC_NAVIS_TOKEN');

// --title <제목> 옵션 파싱, 나머지는 본문 메시지.
const args = process.argv.slice(2);
let title;
const ti = args.indexOf('--title');
if (ti !== -1) {
  title = args[ti + 1];
  args.splice(ti, 2);
}
const text = args.join(' ').trim();

if (!text) {
  console.error('메시지가 비었어. 사용: node scripts/notify-navis.mjs "작업 요약"');
  process.exit(1);
}
if (!url || !token) {
  console.error('NAVIS_URL/NAVIS_TOKEN 없음 (packages/app/.env 확인) — 알림 건너뜀.');
  process.exit(0); // 설정 없으면 실패가 아니라 조용히 스킵
}

const res = await fetch(`${url}/api/reports`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify(title ? { text, title } : { text }),
});

if (!res.ok) {
  console.error(`navis 보고 실패: ${res.status} ${await res.text().catch(() => '')}`);
  process.exit(1);
}
console.log('✅ navis 작업 보고 전송됨 — 앱/데스크톱 알림으로 도착할 거야');
