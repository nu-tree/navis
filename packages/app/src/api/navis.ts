import { makeId } from '../lib/id';
import type { ChatMessage } from '../types';

// TODO(backend): navis 백엔드 연동 시 실제 fetch/스트리밍으로 교체
export async function sendMessage(text: string): Promise<ChatMessage> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    id: makeId('a'),
    role: 'assistant',
    text: `(목업) "${text}" 잘 받았어. 백엔드 붙으면 진짜 나비스가 답할게.`,
    createdAt: new Date().toISOString(),
  };
}
