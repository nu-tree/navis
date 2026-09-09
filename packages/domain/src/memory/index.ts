// 기억 — 저장 · 의미검색 · 조회 · 수정 · 삭제 · 할 일 · 그래프.
//
// 이관 예정 (from packages/namory/src/tools/):
//   save.ts       → save()      중복 방지(유사도 임계값) 포함
//   recall.ts     → recall()    벡터 검색 + 시간 가중치
//   recent.ts     → recent(), list()
//   update.ts     → update()    content 변경 시 재임베딩
//   remove.ts     → remove()
//   todos.ts      → todos()
//   graphify.ts   → graph()
//   filter.ts, project-normalize.ts → 내부 헬퍼
//   ../embedding.ts → embed()   Voyage 1024차원
//
// 이관 시 주의:
//  - tags·done 은 DB 의 metadata jsonb 안에 있고 밖으로는 일급 필드로 나간다.
//    그 매핑이 이 모듈의 책임이다(@navis/db 의 schema.ts 주석 참조).
//  - embed() 의 `json.data[0].embedding` 은 무가드 인덱싱이다. 200 + 빈 data 면
//    TypeError 가 save/recall 밖으로 튄다 — 이관하면서 고칠 것.
//  - 없는 id 에 대한 에러는 한국어 메시지 문자열이 아니라 타입 있는 에러로.

export {};
