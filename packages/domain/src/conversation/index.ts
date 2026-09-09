// 대화방 — 목록 · 조회 · 생성 · 메시지 추가 · 삭제.
//
// 서버가 권위다. 예전의 기기 간 Last-Write-Wins 동기화(클라 updatedAt 비교,
// 시계 왜곡 방어, 툼스톤, 스냅샷 업로드)는 가져오지 않는다 — 클라이언트가
// 하나이므로 그 전부가 불필요하고, 거기 있던 버그도 함께 사라진다.
//
// 이관 시 주의:
//  - 목록은 messages 전체를 반환하지 않는다(ConversationSummary).
//    예전 listConversations 는 SELECT * 로 모든 방의 messages jsonb 를 다 실었다.
//  - 메시지 id 는 randomUUID(). `a${Date.now()}` 는 같은 ms 안에서 충돌한다.

export {};
