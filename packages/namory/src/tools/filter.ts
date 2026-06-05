import { or, eq, isNull, type SQL } from "drizzle-orm";
import { memories } from "../db/schema.js";
import { normalizeProject } from "./project-normalize.js";

// project 스코프 필터. 값이 있으면 "그 프로젝트 OR 개인(null)" 기억만 남기고
// 다른 프로젝트 기억은 제외한다(컨텍스트 토큰 절약). 없으면 필터 없음(undefined).
// 표기 차이를 흡수하도록 정규화한 뒤 비교한다(예: "나비스" 조회 → navis 범위).
// drizzle의 and()/or()는 undefined 인자를 무시하므로 그대로 조합해 쓸 수 있다.
export function projectFilter(project?: string): SQL | undefined {
  const p = normalizeProject(project);
  return p ? or(eq(memories.project, p), isNull(memories.project)) : undefined;
}
