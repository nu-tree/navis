// Hono 컨텍스트 변수. 회원 판정(app.ts)이 채우고 라우트가 읽는다.
export type AppEnv = {
  Variables: {
    /** 이 요청의 회원 uuid. 라우트는 이 값만 domain 의 첫 인자로 넘긴다(specs/002). */
    userId: string;
  };
};
