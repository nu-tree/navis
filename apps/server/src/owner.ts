import { env } from "./env";

/**
 * 관리자인가. resolveUser 가 소문자로 맞추므로 env 값도 소문자로 비교한다.
 * 기억 지우기 · 전하기 라우트(app.ts)와 관리자 대화 턴의 전하기 도구(routes/chat.ts)가 함께 쓴다 —
 * 판정이 두 곳에서 갈라지지 않게 한 군데에 둔다.
 */
export const isOwner = (userId: string) => userId.toLowerCase() === env.ownerId.toLowerCase();
