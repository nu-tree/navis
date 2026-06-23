import * as Speech from 'expo-speech';

// 스트리밍 응답을 "문장 단위로 끊어 직렬 재생"하는 TTS 큐.
// navis 응답은 토큰 델타로 흘러오므로, 델타를 push 하면 문장 경계마다 끊어 말하고
// finish() 로 남은 텍스트를 마저 말한다. 한 문장이 끝나야(onDone) 다음 문장을 말해
// 겹침 없이 자연스럽게 읽는다. 음성 대화모드는 반이중(녹음 중엔 멈춤)이라 stop() 으로
// 즉시 중단(끼어들기)할 수 있다.
//
// 엔진 추상화: 지금은 기기 내장 expo-speech(무료·오프라인)만 쓰지만, 추후 더 자연스러운
// 목소리(ElevenLabs/OpenAI TTS 등)로 바꿀 때 이 클래스만 교체하면 되도록 외부에는
// push/finish/stop/onIdle 인터페이스만 노출한다.

export type SpeechQueueOptions = {
  language?: string; // BCP-47 (기본 'ko-KR')
  rate?: number; // 말하기 속도 (expo-speech 기본 1.0)
  pitch?: number; // 음높이 (기본 1.0)
  onStart?: () => void; // 첫 발화가 시작될 때 1회
  onIdle?: () => void; // 큐가 완전히 비어 더 말할 게 없을 때
  onError?: (e: unknown) => void;
};

// 문장 종결로 볼 문자(한국어/영어/일반). 한국어는 구두점 없이 끝나는 경우가 많아
// 스트리밍 중엔 이 경계만으로 끊고, 나머지는 finish() 에서 강제로 비운다.
const SENTENCE_END = '.!?。…\n';
// 구두점 없이 너무 길어지면(낭독 지연) 공백에서 강제로 끊는 상한.
const MAX_PENDING = 140;

export class SpeechQueue {
  private buffer = ''; // 아직 문장이 안 끝난 누적 텍스트
  private queue: string[] = []; // 말할 문장 대기열
  private speaking = false; // 현재 발화 중인지
  private started = false; // onStart 1회 가드
  private stopped = false; // stop() 후 더 이상 말하지 않음
  private opts: SpeechQueueOptions;

  constructor(opts: SpeechQueueOptions = {}) {
    this.opts = opts;
  }

  // 스트리밍 델타를 흘려넣는다. 문장이 완성될 때마다 큐에 넣고 재생을 잇는다.
  push(delta: string) {
    if (this.stopped || !delta) return;
    this.buffer += delta;
    this.drainSentences();
  }

  // 스트리밍이 끝났음을 알린다 — 남은 버퍼를 마지막 한 덩어리로 말한다.
  finish() {
    if (this.stopped) return;
    const rest = this.buffer.trim();
    this.buffer = '';
    if (rest) this.enqueue(rest);
    // 말할 게 전혀 없었다면(빈 응답) idle 을 직접 알린다.
    else if (!this.speaking && this.queue.length === 0) this.opts.onIdle?.();
  }

  // 즉시 중단(끼어들기/종료). 큐·버퍼를 비우고 네이티브 재생을 멈춘다.
  stop() {
    this.stopped = true;
    this.queue = [];
    this.buffer = '';
    this.speaking = false;
    Speech.stop().catch(() => {});
  }

  get isSpeaking() {
    return this.speaking;
  }

  // 버퍼에서 완성된 문장들을 떼어 큐에 넣는다.
  private drainSentences() {
    // 종결 구두점 기준으로 가능한 만큼 끊는다.
    let cut = this.lastBoundary(this.buffer);
    while (cut >= 0) {
      const chunk = this.buffer.slice(0, cut + 1).trim();
      this.buffer = this.buffer.slice(cut + 1);
      if (chunk) this.enqueue(chunk);
      cut = this.lastBoundary(this.buffer);
    }
    // 구두점 없이 너무 길면 마지막 공백에서 강제로 끊어 낭독 지연을 막는다.
    if (this.buffer.length > MAX_PENDING) {
      const sp = this.buffer.lastIndexOf(' ', MAX_PENDING);
      const at = sp > 0 ? sp : MAX_PENDING;
      const chunk = this.buffer.slice(0, at).trim();
      this.buffer = this.buffer.slice(at);
      if (chunk) this.enqueue(chunk);
    }
  }

  // 문자열에서 마지막 문장 종결 위치(없으면 -1).
  private lastBoundary(s: string): number {
    for (let i = s.length - 1; i >= 0; i--) {
      if (SENTENCE_END.includes(s[i])) return i;
    }
    return -1;
  }

  private enqueue(text: string) {
    if (this.stopped) return;
    this.queue.push(text);
    if (!this.speaking) this.speakNext();
  }

  private speakNext() {
    if (this.stopped) return;
    const next = this.queue.shift();
    if (next == null) {
      // 대기열 소진 — 발화 끝. 단 아직 스트리밍이 진행 중이면 buffer 로 더 올 수 있으니
      // idle 은 "현재 큐가 빈" 시점에 알린다(호출자가 typing 종료와 함께 판단).
      this.speaking = false;
      this.opts.onIdle?.();
      return;
    }
    this.speaking = true;
    if (!this.started) {
      this.started = true;
      this.opts.onStart?.();
    }
    Speech.speak(next, {
      language: this.opts.language ?? 'ko-KR',
      rate: this.opts.rate,
      pitch: this.opts.pitch,
      onDone: () => this.speakNext(),
      onStopped: () => {
        // stop() 경로에서 옴 — 추가 발화 금지(stopped 가드).
      },
      onError: (e) => {
        this.opts.onError?.(e);
        this.speakNext();
      },
    });
  }
}
