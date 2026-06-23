import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useSendMessage } from './use-send-message';
import { useChatStore } from '../store/chat-store';
import { useUiStore } from '../store/ui-store';
import { SpeechQueue } from '../lib/speech';

// 핸즈프리 음성 대화 상태머신 (ChatGPT Voice 식).
//   listening → (말하면 자막) → 침묵/최종 → sending → thinking → speaking → listening …
// STT 는 기기 내장(expo-speech-recognition), TTS 도 기기 내장(expo-speech). 둘 다 무료.
// 응답은 기존 useSendMessage()/SSE 를 그대로 타고, TTS 는 chat-store 의 스트리밍 텍스트를
// 구독해 문장 단위로 읽는다(서버 변경 없음). 반이중: navis 가 말할 땐 STT 를 끈다(에코 방지).
export type VoicePhase =
  | 'idle' // 진입 전/정리됨
  | 'listening' // 마이크 켜고 듣는 중
  | 'thinking' // 전송 후 응답 대기(첫 토큰 전)
  | 'speaking' // navis 응답을 읽는 중
  | 'denied' // 권한 거부
  | 'error'; // 인식 오류

export type VoiceConversation = {
  phase: VoicePhase;
  partial: string; // 듣는 중 인식 자막
  answer: string; // navis 응답 자막(읽는 중)
  errorText: string | null;
  interrupt: () => void; // 끼어들기 — navis 말 끊고 다시 듣기(speaking 중에만 의미)
  exit: () => void; // 음성모드 종료
};

const STT_OPTIONS = {
  lang: 'ko-KR',
  interimResults: true, // 부분 결과로 실시간 자막
  continuous: false, // 침묵/최종(isFinal)까지 듣고 자동 종료 → 자연스러운 턴 구분
} as const;

export function useVoiceConversation(): VoiceConversation {
  const setVoiceMode = useUiStore((s) => s.setVoiceMode);
  const { send } = useSendMessage();

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [partial, setPartial] = useState('');
  const [answer, setAnswer] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  // 핸들러가 최신 값을 보도록 ref 미러링(이벤트 콜백의 stale 클로저 방지).
  const phaseRef = useRef<VoicePhase>('idle');
  const setPhaseBoth = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const finalRef = useRef(''); // 이번 발화의 최종 인식 텍스트
  const ttsRef = useRef<SpeechQueue | null>(null);
  // 이미 TTS 에 넘긴 텍스트(접두). 증분만 말하되, 최종 보정(setMessageText)으로 앞부분이
  // 달라지면 잘못 읽지 않도록 startsWith 로 append-only 를 확인한다.
  const spokenTextRef = useRef('');
  const watchConvRef = useRef<string | null>(null); // 응답을 기다리는 대화방
  const aliveRef = useRef(true); // 음성모드 활성 여부(정리 후 콜백 무시)
  const lastStartRef = useRef(0); // 마지막 듣기 시작 시각(빈-end 폭주 감지용)
  const rapidEmptyRef = useRef(0); // 연속 즉시-빈종료 횟수(오디오 실패 폭주 차단)

  // ── 듣기 시작 ─────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!aliveRef.current) return;
    finalRef.current = '';
    lastStartRef.current = Date.now();
    setPartial('');
    setAnswer('');
    setPhaseBoth('listening');
    try {
      ExpoSpeechRecognitionModule.start(STT_OPTIONS);
    } catch {
      setErrorText('마이크를 시작하지 못했어요.');
      setPhaseBoth('error');
    }
  }, [setPhaseBoth]);

  // ── 응답 전송 + TTS 준비 ──────────────────────────────────
  const submit = useCallback(
    (text: string) => {
      if (!aliveRef.current) return;
      setPartial('');
      setAnswer('');
      setPhaseBoth('thinking');
      spokenTextRef.current = '';
      watchConvRef.current = useChatStore.getState().activeId;
      // 이전 턴 큐가 어떤 이유로든 살아있으면 멈추고 새로 만든다(겹침/누수 방지).
      ttsRef.current?.stop();
      ttsRef.current = new SpeechQueue({
        language: 'ko-KR',
        onStart: () => {
          if (aliveRef.current) setPhaseBoth('speaking');
        },
        onIdle: () => {
          // 큐가 비었고 응답 생성도 끝났으면 다시 듣기로(턴 종료). 생성 진행 중이면
          // 다음 델타가 큐를 다시 채우므로 무시한다. 이미 듣는 중이면 중복 start 금지.
          if (!aliveRef.current || phaseRef.current === 'listening') return;
          const conv = watchConvRef.current;
          const generating =
            !!conv && useChatStore.getState().typingIds.includes(conv);
          if (!generating) startListening();
        },
      });
      send(text);
    },
    [send, setPhaseBoth, startListening],
  );

  // ── STT 이벤트 ────────────────────────────────────────────
  useSpeechRecognitionEvent('result', (e) => {
    if (phaseRef.current !== 'listening') return;
    const transcript = e.results?.[0]?.transcript ?? '';
    if (e.isFinal) finalRef.current = transcript;
    else setPartial(transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    if (!aliveRef.current || phaseRef.current !== 'listening') return;
    const text = finalRef.current.trim();
    if (text) {
      rapidEmptyRef.current = 0;
      submit(text);
      return;
    }
    // 빈 종료. 정상 침묵(사용자가 생각 중)은 계속 듣는다. 단 start 직후 즉시 끝나는
    // 빈-end 가 연속되면(오디오 캡처 실패 등) 타이트 루프가 되어 배터리/네이티브를
    // 태우므로, 빠른 빈-end 가 연속 N 회면 멈추고 오류로 알린다.
    const elapsed = Date.now() - lastStartRef.current;
    if (elapsed < 800) {
      rapidEmptyRef.current += 1;
      if (rapidEmptyRef.current >= 5) {
        rapidEmptyRef.current = 0;
        setErrorText('마이크를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.');
        setPhaseBoth('error');
        return;
      }
    } else {
      rapidEmptyRef.current = 0;
    }
    startListening();
  });

  useSpeechRecognitionEvent('error', (e) => {
    if (!aliveRef.current) return;
    // 'aborted' 는 우리가 의도적으로 abort() 한 결과 — 다시 abort 하면 무한 루프가 되므로
    // 무시한다(재청취는 뒤따르는 'end' 가 처리). no-speech 는 정상 침묵이라 무시.
    if (e.error === 'aborted' || e.error === 'no-speech') return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
      setErrorText('마이크/음성 인식 권한이 필요해요.');
      setPhaseBoth('denied'); // 영구 — end 가 phase!=listening 이라 재청취 안 함
      return;
    }
    // 그 외(network/audio-capture/busy/client 등)는 일시 오류로 보고 복구한다.
    // abort 가 'end' 를 유발하고, phase 를 listening 으로 유지하면 end 핸들러가
    // (폭주 가드와 함께) 재청취한다.
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {}
  });

  // ── 응답 스트리밍 구독 → TTS 공급 + 자막 ─────────────────
  useEffect(() => {
    const unsub = useChatStore.subscribe((state) => {
      const conv = watchConvRef.current;
      const tts = ttsRef.current;
      if (!conv || !tts || !aliveRef.current) return;
      const phaseNow = phaseRef.current;
      if (phaseNow !== 'thinking' && phaseNow !== 'speaking') return;

      const c = state.conversations.find((x) => x.id === conv);
      const msgId = state.streamingId[conv];
      const msg = msgId ? c?.messages.find((m) => m.id === msgId) : undefined;
      if (msg) {
        // 자막은 항상 최신 텍스트로(음성과 독립). 음성은 append-only 일 때만 새 꼬리를
        // 넘긴다 — 최종 보정(setMessageText)으로 앞부분이 바뀌거나 짧아지면 잘못 읽히지
        // 않도록 startsWith 로 확인하고, 그 경우 보정분은 음성에서 건너뛴다(이미 거의 읽음).
        setAnswer(msg.text);
        const spoken = spokenTextRef.current;
        if (msg.text.length > spoken.length && msg.text.startsWith(spoken)) {
          tts.push(msg.text.slice(spoken.length));
          spokenTextRef.current = msg.text;
        }
      }

      // 응답 생성이 끝났으면(typing 빠짐) 남은 버퍼를 마저 읽게 하고, 이후 이 턴의
      // 구독 처리는 멈춘다(watchConv 해제) — finish 가 매 state 변화마다 반복 호출되지
      // 않도록. TTS 재생은 계속되고, 큐가 비면 onIdle 이 다음 듣기로 넘긴다.
      if (!state.typingIds.includes(conv)) {
        watchConvRef.current = null;
        tts.finish();
      }
    });
    return unsub;
  }, []);

  // ── 권한 → 첫 듣기 시작 ──────────────────────────────────
  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const perm =
          await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (cancelled) return;
        if (!perm.granted) {
          setErrorText('마이크/음성 인식 권한이 필요해요.');
          setPhaseBoth('denied');
          return;
        }
        startListening();
      } catch {
        if (!cancelled) {
          setErrorText('음성 기능을 시작하지 못했어요.');
          setPhaseBoth('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
      ttsRef.current?.stop();
      ttsRef.current = null;
    };
  }, [setPhaseBoth, startListening]);

  // ── 백그라운드 진입 시 안전 종료(포그라운드 전제) ────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      // 'background' 에서만 종료한다. 'inactive'(권한 팝업·제어센터·알림 배너)는 잠깐
      // 스쳐가는 상태라 여기서 끄면 권한 요청 도중 모드가 자기파괴된다.
      if (s === 'background') setVoiceMode(false);
    });
    return () => sub.remove();
  }, [setVoiceMode]);

  // ── 끼어들기: navis 말 끊고 다시 듣기 ────────────────────
  const interrupt = useCallback(() => {
    if (phaseRef.current !== 'speaking') return;
    // 아직 응답을 생성 중이면(긴 답을 읽기 시작한 사이) 서버 생성을 멈춰, 같은 대화에
    // 두 번째 send 와 스트림이 겹치지 않게 한다. 생성이 이미 끝났으면 watchConv 는
    // 구독에서 null 로 해제된 상태라 건너뛴다.
    const conv = watchConvRef.current;
    if (conv && useChatStore.getState().typingIds.includes(conv)) {
      useChatStore.getState().stopGenerating(conv);
    }
    ttsRef.current?.stop();
    ttsRef.current = null;
    watchConvRef.current = null;
    startListening();
  }, [startListening]);

  const exit = useCallback(() => {
    setVoiceMode(false);
  }, [setVoiceMode]);

  return { phase, partial, answer, errorText, interrupt, exit };
}
