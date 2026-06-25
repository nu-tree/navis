// 슬래시 명령 정의 — CLI 입력선에서 "/" 입력 시 자동완성 메뉴로 뜬다(방향키 선택).
export type SlashCommand = { name: string; desc: string };

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "/model", desc: "응답 모델 변경 (방향키로 선택)" },
  { name: "/reset", desc: "세션 초기화 — 새 대화 시작" },
  { name: "/project", desc: "현재 감지된 프로젝트 표시" },
  { name: "/clear", desc: "화면 비우기" },
  { name: "/help", desc: "명령어 목록 보기" },
  { name: "/quit", desc: "navis 종료" },
];

// 입력이 "/..."(공백 없음 = 아직 명령 이름 타이핑 중)일 때만 후보를 돌려준다.
// 공백이 들어가면(인자 입력) 메뉴를 닫아 일반 제출로 흐르게 한다.
export function matchCommands(input: string): SlashCommand[] {
  if (!input.startsWith("/") || /\s/.test(input)) return [];
  const q = input.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}
