// 재임베딩 러너. `pnpm --filter @navis/domain reembed [모델명]`
//
// 모델을 바꿀 때 두 단계 중 두 번째다:
//   1) embed.ts 의 DEFAULT_MODEL 을 바꾼다
//   2) 이걸 돌린다
//
// 인자로 모델을 주면 그 모델로 만든다(설정을 먼저 바꾸지 않고 시험할 때).

import { reembedAll } from "./reembed";

// 사용법: reembed [모델명] [청크크기] [간격ms]
//   기본값(200건/요청, 대기 없음)은 표준 한도를 전제한다.
//   Voyage 에 결제수단이 없으면 분당 3회·10K 토큰으로 묶이므로:
//     reembed voyage-4-large 6 20000
const model = process.argv[2];
const chunkSize = process.argv[3] ? Number(process.argv[3]) : undefined;
const pauseMs = process.argv[4] !== undefined ? Number(process.argv[4]) : undefined;
const started = Date.now();

console.log(`재임베딩 시작${model ? ` (모델: ${model})` : ""}`);

const { updated, skipped } = await reembedAll({
  ...(model ? { model } : {}),
  ...(chunkSize ? { chunkSize } : {}),
  ...(pauseMs !== undefined ? { pauseMs } : {}),
  onProgress: ({ done, total, skipped }) => {
    const pct = Math.round((done / total) * 100);
    process.stdout.write(`\r  ${done}/${total} (${pct}%)${skipped ? ` · 건너뜀 ${skipped}` : ""}`);
  },
});

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n완료: ${updated}건 갱신${skipped ? `, ${skipped}건 건너뜀` : ""} (${secs}초)`);
process.exit(0);
