// 스트리밍 델타를 한 글자씩 흘려주는 애니메이터.
// API가 한 번에 큰 청크를 보내도 onChar가 12ms 간격으로 호출되어 Claude 웹처럼 부드럽게 보인다.
// 큐가 쌓이면 딜레이를 줄여 따라잡고, flush() 호출 시 즉시 나머지를 한꺼번에 방출한다.

const BASE_DELAY = 12; // ms per char — 기본 속도 (약 80자/초)
const FAST_THRESHOLD = 40; // 큐에 이 이상 쌓이면 가속

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
      // 큐가 많이 쌓이면 한 번에 더 많이 방출해 따라잡는다
      const burst = backlog > FAST_THRESHOLD ? Math.ceil(backlog / 10) : 1;
      const chars = this.queue.splice(0, burst).join('');
      this.onChar(chars);
      const delay = backlog > FAST_THRESHOLD ? Math.max(2, BASE_DELAY / 3) : BASE_DELAY;
      await new Promise<void>((r) => setTimeout(r, delay));
    }
    this.running = false;
  }
}
