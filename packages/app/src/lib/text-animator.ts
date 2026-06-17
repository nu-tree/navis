// 스트리밍 델타를 한 글자씩 흘려주는 애니메이터.
// API가 한 번에 큰 청크를 보내도 onChar가 12ms 간격으로 호출되어 Claude 웹처럼 부드럽게 보인다.
// 큐가 쌓이면 딜레이를 줄여 따라잡고, flush() 호출 시 즉시 나머지를 한꺼번에 방출한다.

const BASE_DELAY = 8; // ms per char — 기본 타이핑 속도 (약 125자/초)
const FAST_THRESHOLD = 40; // 큐에 이 이상 쌓이면 가속
// 이 이상 밀리면(긴 답변) 타이핑 효과를 포기하고 통째로 방출 — 답이 이미 다 왔는데
// 글자가 수 초간 기어나오는 체감 지연을 막는다(표시가 수신보다 ~1초 이상 뒤처지지 않게).
const DUMP_THRESHOLD = 220;

export class TextAnimator {
  private queue: string[] = [];
  private running = false;
  private done = false;

  constructor(private onChar: (chars: string) => void) {}

  push(text: string) {
    for (const ch of text) this.queue.push(ch);
    if (!this.running) this.run();
  }

  flush() {
    this.done = true;
    if (this.queue.length > 0) {
      this.onChar(this.queue.join(''));
      this.queue = [];
    }
  }

  private async run() {
    this.running = true;
    while (this.queue.length > 0 && !this.done) {
      const backlog = this.queue.length;
      // 표시가 수신을 너무 뒤처지지 않게 단계적으로 가속한다:
      //  - 크게 밀리면(긴 답) 타이핑 효과를 버리고 통째로 방출 → 글자가 기어나오는 체감지연 제거
      //  - 적당히 밀리면 한 번에 1/3씩 빠르게 따라잡음
      //  - 평상시엔 한 글자씩(부드러운 타이핑)
      if (backlog > DUMP_THRESHOLD) {
        this.onChar(this.queue.splice(0, backlog).join(''));
        continue; // 지연 없이 즉시 다음 루프 — 남은 큐도 바로 처리
      }
      const fast = backlog > FAST_THRESHOLD;
      const burst = fast ? Math.ceil(backlog / 3) : 1;
      this.onChar(this.queue.splice(0, burst).join(''));
      await new Promise<void>((r) => setTimeout(r, fast ? 4 : BASE_DELAY));
    }
    this.running = false;
  }
}
