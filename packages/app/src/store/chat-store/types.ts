// 채팅 스토어 공유 타입 모음 — 대화방/동기화 행/보고/스토어 인터페이스 정의.
// 외부(api·컴포넌트)에서도 import 하는 공개 타입은 여기 한곳에 둔다.
import type { ChatMessage } from '../../types';

// 'code' = 데스크톱 로컬 에이전트(클로드 코드) 세션. 서버 동기화 대상이 아니라
// 이 기기에만 남는다(use-conversation-sync 는 'chat' 만 올림).
export type ConversationKind = 'chat' | 'report' | 'code';

export type Conversation = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  // 대화방마다 독립된 navis 세션 — 컨텍스트가 방끼리 섞이지 않는다.
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  // 카톡식 안 읽은 메시지 수 — 비활성 방에 navis 메시지/보고가 오면 +1, 방 열면 0.
  unread?: number;
  // 보고방 숨김 — 목록에서 가리되 데이터/크론은 유지(언제든 다시 보이게).
  hidden?: boolean;
  // 코드 세션(kind==='code') 전용: 이 세션의 작업 폴더(세션별) + 그 폴더의 namory
  // 프로젝트명(폴더명 폴백). 폴더를 고르면 그 레포의 기억이 연결되고 없으면 자동 생성된다.
  workdir?: string;
  project?: string;
  // 코드 세션의 현재 git 브랜치(폴더가 git 저장소일 때). 브랜치 칩에 표시.
  branch?: string;
};

// 서버 동기화로 내려오는 대화방 행(머지 입력). deletedAt 있으면 삭제 전파.
export type ConversationSyncRow = {
  id: string;
  title: string;
  kind: ConversationKind;
  messages: ChatMessage[];
  sessionId: string | null;
  unread: number;
  hidden: boolean;
  updatedAt: string;
  deletedAt: string | null;
};

// navis /api/reports 응답 항목
export type Report = {
  id: string;
  type: string;
  // 방 라우팅 키 (크론 id / "digest" / "calendar") + 방 제목(DB 기반)
  sourceId: string;
  sourceTitle: string;
  text: string;
  createdAt: string;
};

export type ChatStore = {
  conversations: Conversation[]; // 최신이 앞
  activeId: string;
  typingIds: string[]; // 응답 생성 중인 대화방 id 목록 (방별 독립)
  typingStatus: Record<string, string>; // 대화방별 현재 도구 상태 텍스트
  typingStartedAt: Record<string, number>; // 대화방별 typing 시작 타임스탬프(ms)
  // 대화방별 '지금 스트리밍 중인 응답 말풍선 id'. 그 말풍선의 작업/생각 블록을 생성
  // 중엔 자동으로 펼쳐 두고, 끝나면(id 해제) 자동으로 접는다. 휘발성(persist 제외).
  streamingId: Record<string, string | undefined>;
  // 진행 중인 서버 스트림의 AbortController(방별). 중지 버튼이 이걸 abort 한다. 휘발성.
  aborters: Record<string, AbortController>;
  // 진행 중인 턴의 서버측 취소 함수(방별). 서버는 연결 종료를 "백그라운드"로 보고
  // 생성을 계속하므로, 중지 버튼은 abort 와 함께 이 함수로 /api/chat/cancel 도 부른다. 휘발성.
  cancelers: Record<string, () => void>;
  // 진행 중인 턴의 서버 turnId(방별). 앱이 백그라운드로 갈 때 이 turnId 들로 서버에
  // 핸드오프를 알려, 프록시가 연결 끊김을 가려도 서버가 백그라운드 완주+푸시를 타게 한다.
  // 휘발성(persist 제외).
  inflightTurns: Record<string, string>;
  // 사용자가 고른 채팅 모델(클로드 데스크톱식). 전역 1개 — 모든 대화방에 적용되고
  // persist 로 유지된다. 일반 채팅(kind==='chat')에서만 의미 있다(코드 세션은
  // 로컬 에이전트, 보고방은 읽기 전용).
  model: string;
  setModel: (model: string) => void;
  newConversation: () => string;
  // 코드(로컬 에이전트) 세션 새로 만들기 — 빈 코드 세션이 이미 있으면 그걸로.
  newCodeSession: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  addMessage: (conversationId: string, message: ChatMessage) => void;
  // 스트리밍: 기존 메시지 텍스트에 델타를 이어붙임(점진 표시)
  appendMessageText: (conversationId: string, messageId: string, delta: string) => void;
  // 스트리밍 종료 시 권위 있는 최종 텍스트로 보정
  setMessageText: (conversationId: string, messageId: string, text: string) => void;
  setMessageToolsUsed: (conversationId: string, messageId: string, tools: string[]) => void;
  // 스트리밍 중 도구 한 개씩 실시간 추가
  appendMessageTool: (conversationId: string, messageId: string, label: string) => void;
  // 스트리밍 중 생각 과정(확장 사고) 델타 이어붙임
  appendMessageThinking: (conversationId: string, messageId: string, delta: string) => void;
  // 중지 버튼: 진행 중 스트림을 abort + typing 해제. 코드 세션은 localAgent.stop 으로 별도.
  setAborter: (conversationId: string, controller?: AbortController) => void;
  // 진행 중인 턴의 서버측 취소 함수 등록/해제(undefined 면 해제).
  setCanceler: (conversationId: string, cancel?: () => void) => void;
  // 진행 중인 턴의 서버 turnId 등록/해제(undefined 면 해제). 백그라운드 핸드오프용.
  setInflightTurn: (conversationId: string, turnId?: string) => void;
  stopGenerating: (conversationId: string) => void;
  setSessionId: (conversationId: string, sessionId?: string) => void;
  // 코드 세션의 작업 폴더 설정(+폴더 선택 시). 폴더가 바뀌면 namory 세션(sessionId)도
  // 끊어 새 폴더 맥락으로 다시 시작한다. 제목도 폴더/프로젝트명으로 갱신.
  setCodeFolder: (conversationId: string, workdir: string, project?: string) => void;
  // 코드 세션의 현재 브랜치 갱신(체크아웃 후 표시용).
  setCodeBranch: (conversationId: string, branch: string) => void;
  setTyping: (conversationId: string, typing: boolean) => void;
  setTypingStatus: (conversationId: string, tool: string) => void;
  // 스트리밍 중인 응답 말풍선 id 설정/해제(undefined 면 해제).
  setStreamingId: (conversationId: string, messageId?: string) => void;
  // 메시지 이모지 리액션 토글 (있으면 제거, 없으면 추가)
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => void;
  // 보고방을 보장(없으면 생성, 있으면 제목 갱신) — 크론 목록으로 미리 만들 때
  ensureReportRoom: (sourceId: string, title: string) => void;
  // navis 선제 보고를 출처(sourceId) 방에 추가(없으면 방 생성, 중복 id 무시)
  appendReport: (report: Report) => void;
  // 보고방 숨김/해제
  hideConversation: (id: string) => void;
  unhideConversation: (id: string) => void;
  // 같은 kind 안에서 보이는 방들의 새 순서(id 배열)로 재정렬 — 드래그앤드롭용
  reorderConversations: (kind: ConversationKind, orderedVisibleIds: string[]) => void;
  // 서버에서 받은 대화 스냅샷을 병합 — 방 단위 Last-Write-Wins(updatedAt) + 삭제 전파.
  mergeServerConversations: (rows: ConversationSyncRow[]) => void;
};
