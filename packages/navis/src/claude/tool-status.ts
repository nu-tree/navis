// 도구 이름 + 인풋에서 사람이 읽기 좋은 진행 상태 문자열 생성.
// content_block_start(이름만) 이후 assistant 메시지(전체 input)에서 한 번 더 업데이트할 때 씀.

const short = (v: unknown, max = 20): string => {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

export function richToolStatus(
  name: string,
  input: Record<string, unknown> = {},
): string {
  if (name === "mcp__namory__recall") {
    const q = input.query ?? input.q ?? "";
    return q ? `기억 검색: ${short(q)}` : "기억을 찾는 중";
  }
  if (name === "mcp__namory__save") return "기억을 저장하는 중";
  if (name === "mcp__namory__recent") return "최근 기억 확인 중";
  if (name === "mcp__namory__todos") return "할 일 목록 확인 중";
  if (name === "mcp__namory__update") return "기억 수정 중";
  if (name === "mcp__namory__delete") return "기억 삭제 중";
  if (name === "mcp__namory__graphify") return "기억 그래프 보는 중";
  if (name === "mcp__namory__pattern") return "기억 패턴 보는 중";
  if (name === "mcp__namory__profile_show") return "프로필 확인 중";

  if (name.startsWith("mcp__google__list")) {
    const start = input.start_date ?? input.timeMin ?? "";
    return start ? `캘린더 확인: ${short(start, 10)}` : "캘린더 확인 중";
  }
  if (name === "mcp__google__create_event") {
    const title = input.summary ?? input.title ?? "";
    return title ? `일정 추가: ${short(title)}` : "일정 추가 중";
  }
  if (name.startsWith("mcp__google__")) return "캘린더 작업 중";

  if (name === "mcp__repo__read_repo_file") {
    const p = input.path ?? input.file_path ?? "";
    return p ? `코드 읽기: ${short(p)}` : "코드 확인 중";
  }
  if (name === "mcp__repo__list_repo_files") return "파일 목록 확인 중";
  if (name.startsWith("mcp__self_modify__")) return "코드 개선 요청 중";
  if (name.startsWith("mcp__cron__")) return "예약 작업 설정 중";

  if (name === "Read") {
    const p = input.file_path ?? "";
    return p ? `파일 읽기: ${short(String(p).split("/").pop() ?? p)}` : "파일 읽는 중";
  }
  if (name === "Write" || name === "Edit") {
    const p = input.file_path ?? "";
    return p ? `파일 수정: ${short(String(p).split("/").pop() ?? p)}` : "파일 수정 중";
  }
  if (name === "Bash") {
    const cmd = input.command ?? "";
    return cmd ? `실행: ${short(cmd)}` : "명령 실행 중";
  }
  if (name === "WebSearch") {
    const q = input.query ?? "";
    return q ? `검색: ${short(q)}` : "검색 중";
  }
  if (name === "WebFetch") {
    const url = String(input.url ?? "").replace(/^https?:\/\//, "");
    return url ? `페이지 읽기: ${short(url)}` : "페이지 읽는 중";
  }

  return "작업하는 중";
}
