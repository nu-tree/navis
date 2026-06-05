import { or, isNull, sql, type SQL } from "drizzle-orm";
import { memories } from "../db/schema.js";
import { normalizeProject } from "./project-normalize.js";

// project 스코프 필터. 값이 있으면 "그 프로젝트 OR 개인(null)" 기억만 남기고
// 다른 프로젝트 기억은 제외한다(컨텍스트 토큰 절약). 없으면 필터 없음(undefined).
// 대소문자 차이는 lower() 비교로 흡수(일반 규칙, 하드코딩 없음).
// drizzle의 and()/or()는 undefined 인자를 무시하므로 그대로 조합해 쓸 수 있다.
export function projectFilter(project?: string): SQL | undefined {
  const p = normalizeProject(project);
  return p
    ? or(sql`lower(${memories.project}) = ${p.toLowerCase()}`, isNull(memories.project))
    : undefined;
}
