-- 데이터 디렉터리가 비어 있을 때 한 번만 실행된다.
--
-- 마이그레이션에 넣을 수 없는 이유: 첫 마이그레이션(0000)이 이미 `vector(1024)` 컬럼을
-- 만들기 때문에, 확장은 그보다 먼저 존재해야 한다. drizzle 에는 마이그레이션 이전에
-- 끼어들 자리가 없다. 즉 이건 마이그레이션 사안이 아니라 **프로비저닝** 사안이다.
-- 관리형 Postgres 는 이걸 대신 해준다.

-- 기억 벡터 검색 (1024차원, HNSW + vector_cosine_ops).
CREATE EXTENSION IF NOT EXISTS vector;

-- schema.ts 가 uuid PK 기본값으로 gen_random_uuid() 를 쓴다.
-- Postgres 13+ 에는 내장이지만, 확실히 해둔다.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
