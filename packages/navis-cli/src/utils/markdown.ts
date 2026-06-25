import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

// 마크다운 → 터미널 ANSI 변환. navis 답변(헤딩/굵게/코드블록/리스트/표/링크)을
// 보기 쉽게 색·서식으로 렌더한다. Ink <Text> 는 ANSI 이스케이프를 그대로 출력하므로
// 변환된 문자열을 그대로 넣으면 된다.
//
// marked-terminal 은 동기 렌더러라 marked.parse 가 문자열을 즉시 돌려준다(async 확장 없음).
marked.use(markedTerminal());

export function renderMarkdown(md: string): string {
  try {
    const out = marked.parse(md) as string;
    // 끝의 잉여 개행만 정리(앞쪽 서식은 보존).
    return out.replace(/\s+$/, "");
  } catch {
    // 변환 실패 시 원문 그대로 — 답변을 잃지 않는다.
    return md;
  }
}
