## 계획

1. 우선 챗 ui를 먼저 그린다.
2. 그런다음 내 기억을 볼 수 있는 설정 화면? 을 그린다
3. 전체적으로 ui 다듬기를 시작한다.
4. 이제 실제 채팅 기능을 넣는다

my-ai/
│
├── apps/
│ │
│ ├── web/
│ │ └── src/
│ │ ├── app/
│ │ ├── features/
│ │ │ ├── chat/
│ │ │ ├── conversation/
│ │ │ └── settings/
│ │ ├── components/
│ │ │ └── ui/
│ │ └── lib/
│ │
│ ├── mobile/
│ │ └── src/
│ │ ├── features/
│ │ │ ├── chat/
│ │ │ ├── conversation/
│ │ │ └── settings/
│ │ ├── components/
│ │ │ └── ui/
│ │ └── lib/
│ │
│ └── server/
│ └── src/
│ ├── modules/
│ │ ├── chat/
│ │ ├── conversation/
│ │ └── user/
│ └── ...
│
├── packages/
│ │
│ ├── domain/
│ │ └── src/
│ │ ├── chat/
│ │ ├── conversation/
│ │ └── user/
│ │
│ ├── validation/
│ │ └── src/
│ │ ├── chat/
│ │ └── conversation/
│ │
│ ├── api/
│ │ └── src/
│ │ ├── chat.ts
│ │ └── conversation.ts
│ │
│ ├── hooks/
│ │ └── src/
│ │ ├── useDebounce.ts
│ │ └── ...
│ │
│ ├── db/
│ │ └── src/
│ │ ├── client.ts
│ │ └── ...
│ │
│ └── config/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json

                    ┌──────────────┐
                    │   domain     │
                    └──────▲───────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
       ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
       │ validation │ │    api    │ │   hooks   │
       └─────▲─────┘ └─────▲─────┘ └───────────┘
             │             │
       ┌─────┴─────────────┴──────┐
       │                          │

┌───┴────┐ ┌────┴────┐
│ web │ │ mobile │
└────────┘ └─────────┘

server는 hono 사용
