// 메시지 전송 훅(use-send-message)의 공유 타입 정의.
// SendVars: mutation 입력 변수. 분리된 러너 모듈들이 함께 참조한다.
import { type Attachment } from "../../api/navis";
import { type NamoryMcp } from "../../lib/local-agent";

export type SendVars = {
  text: string;
  conversationId: string;
  attachments?: Attachment[];
  // 데스크톱 로컬 에이전트로 보낼지 (내 맥 파일/터미널). 채팅 호출 시점에 결정.
  local?: boolean;
  // 코드 세션 멀티턴 — 이어갈 SDK 세션 id(로컬 에이전트 전용).
  resume?: string;
  // 코드 세션의 작업 폴더(세션별) — 로컬 에이전트가 이 폴더에서 돈다.
  workdir?: string;
  // 코드 세션 기억 연결 — namory MCP 좌표(있으면 recall/save 도구 연결).
  namory?: NamoryMcp | null;
};

// 스트림 단계에서 말풍선 생성·typing 상태·텍스트 누적을 다루는 공유 컨텍스트.
// 메인 훅이 만들어 러너 모듈에 주입한다(스토어 접근/타이밍을 한 곳에 모은다).
export type StreamContext = {
  conversationId: string;
  assistantId: string;
  // 첫 델타/도구 호출 시 어시스턴트 말풍선을 1회 생성한다.
  ensureBubble: () => void;
  // 현재 말풍선이 생성됐는지(델타가 한 번이라도 왔는지) 조회.
  isStarted: () => boolean;
  // typing 인디케이터 상태 갱신(같은 값이면 건너뜀).
  setStatus: (s: string) => void;
};
