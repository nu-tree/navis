// marked-terminal@7 은 타입 선언을 동봉하지 않는다(@types 도 v7 미지원). 우리가 쓰는
// 표면(markedTerminal 확장 팩토리)만 최소 선언한다 — marked.use() 에 넣을 MarkedExtension 반환.
declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";
  export function markedTerminal(
    options?: Record<string, unknown>,
    highlightOptions?: Record<string, unknown>,
  ): MarkedExtension;
}
