# Data Model: 여러 사람이 쓰는 나비스

001 의 [data-model.md](../001-core-memory-chat/data-model.md) 위에 **주인(`user_id`)** 하나를 더한다.
나머지 필드 · 규칙은 그대로다.

## 회원 (Member) — 저장하지 않는다

계정은 인증 제공자(Supabase Auth)가 갖는다. 나비스 DB 에는 회원 테이블이 **없다** — `user_id` 는 그
제공자의 사용자 uuid 를 그대로 쓴다. 외래 키를 걸지 않는다(다른 스키마 · 다른 서비스의 테이블이다).

관리자(Owner)는 배포 설정 `NAVIS_OWNER_ID` 로 정해지는 회원 한 명이다(research R2).

## 변경

| 테이블 | 추가 · 변경 | 규칙 |
| --- | --- | --- |
| `memories` | `user_id uuid NOT NULL` | 모든 조회에 `user_id = $1`. 인덱스 `memories_user_created_idx (user_id, created_at desc)` |
| `conversations` | `user_id uuid NOT NULL` | 인덱스 `conversations_user_updated_idx (user_id, updated_at desc)`. PK `id` 는 전역 유일 그대로(R8) |
| `settings` | `user_id uuid NOT NULL`, PK `(key)` → `(user_id, key)` | 회원마다 `claude_oauth_token` 하나 |

- 기존 단일 열 인덱스 `memories_created_at_idx` · `conversations_updated_at_idx` 는 회원별 복합 인덱스로
  대체된다(모든 목록이 회원으로 먼저 좁혀지므로 단일 열 인덱스를 탈 질의가 없다).
- `memories_project_idx` · `memories_category_idx` 는 남긴다 — 회원 조건과 함께 비트맵으로 합쳐진다.
  규모가 커져 느려지면 그때 복합으로 바꾼다.
- HNSW 인덱스는 그대로다(research R5).

## 규칙

- **주인 없는 행은 없다** — `NOT NULL` 이 보증한다(FR-101).
- **남의 행은 없는 것과 같다** — id 로 찾을 때도 `id = $id AND user_id = $user`. 하나라도 빠지면
  `NotFoundError`(FR-103).
- **프로젝트 이름은 회원의 범위 안에서만 의미가 있다** — `projects` · `renameProject` ·
  `similarProjects` 모두 `user_id` 로 좁힌다(FR-105).
- **이웃 조회의 기준 벡터도 자기 기억이어야 한다** — 남의 기억 id 로 이웃을 부르면 그 기억을 못 찾아
  `NotFoundError`.

## 전환 (research R4)

```
0008  user_id 열 추가(null 허용) + 인덱스
 ↓    assign-owner 스크립트: user_id is null → NAVIS_OWNER_ID
0009  NOT NULL · settings PK (user_id, key)
 ↓    새 코드 배포
```

옮긴 행 수 = 전환 전 행 수 여야 한다(SC-103). 스크립트가 테이블별 건수를 출력한다.
