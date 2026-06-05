#!/usr/bin/env node
// navis-notify MCP 서버 (stdio).
// Claude Code 에 붙여, 작업을 끝냈을 때 navis 로 "완료 보고" 를 보내는 도구를 제공한다.
// navis 가 보고를 저장하면 앱/데스크톱이 폴링해 맥 네이티브 알림으로 띄운다.
//
// 등록: 레포 .mcp.json 의 mcpServers.navis-notify (command: node, args: 이 파일).
// 접속값: env(NAVIS_URL/NAVIS_TOKEN) 우선, 없으면 packages/app/.env 의
//   EXPO_PUBLIC_NAVIS_URL / EXPO_PUBLIC_NAVIS_TOKEN 사용.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFile(key) {
  try {
    const txt = readFileSync(join(root, 'packages/app/.env'), 'utf8');
    const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

function resolveConfig() {
  const url = (
    process.env.NAVIS_URL ||
    process.env.EXPO_PUBLIC_NAVIS_URL ||
    fromEnvFile('EXPO_PUBLIC_NAVIS_URL')
  ).replace(/\/+$/, '');
  const token =
    process.env.NAVIS_TOKEN ||
    process.env.EXPO_PUBLIC_NAVIS_TOKEN ||
    fromEnvFile('EXPO_PUBLIC_NAVIS_TOKEN');
  return { url, token };
}

const server = new Server(
  { name: 'navis-notify', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'notify',
      description:
        '작업을 끝냈을 때 사용자에게 navis 채팅방으로 완료 보고를 보낸다(→ 맥/데스크톱 네이티브 알림). 실질적 작업(코드 변경·버그 수정·빌드·배포 등)을 마쳤을 때 한 번 호출. 무엇을 했는지 한두 문장으로 요약하고 가능하면 커밋 해시를 포함하라. 단순 질문 답변·사소한 수정·탐색만 한 경우엔 호출하지 말 것.',
      inputSchema: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: '완료 보고 본문 — 무엇을/왜 했는지 요약(+커밋 해시).',
          },
          title: {
            type: 'string',
            description: "방 제목(선택). 기본 '🤖 작업 보고'.",
          },
        },
        required: ['text'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'notify') {
    return { content: [{ type: 'text', text: `알 수 없는 도구: ${req.params.name}` }], isError: true };
  }
  const args = req.params.arguments ?? {};
  const text = String(args.text ?? '').trim();
  const title = typeof args.title === 'string' && args.title ? args.title : undefined;

  if (!text) {
    return { content: [{ type: 'text', text: 'text 가 비었음.' }], isError: true };
  }

  const { url, token } = resolveConfig();
  if (!url || !token) {
    return {
      content: [
        { type: 'text', text: 'NAVIS_URL/NAVIS_TOKEN 미설정(packages/app/.env 확인) — 보고 건너뜀.' },
      ],
      isError: true,
    };
  }

  try {
    const res = await fetch(`${url}/api/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(title ? { text, title } : { text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        content: [{ type: 'text', text: `navis 보고 실패: ${res.status} ${body}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: '✅ navis 작업 보고 전송됨 — 앱/데스크톱 알림으로 도착.' }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `navis 보고 오류: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
