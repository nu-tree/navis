import { Box, Text } from "ink";
import { renderMarkdown } from "../utils/markdown.js";
import type { Turn } from "../types/types.js";

// 대화 한 턴을 종류별로 렌더. 사용자/답변(마크다운)/노트/오류 4가지.
export function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === "user") {
    return (
      <Box marginTop={1}>
        <Text color="cyan" bold>
          ❯{" "}
        </Text>
        <Text>{turn.text}</Text>
      </Box>
    );
  }
  if (turn.kind === "assistant") {
    return (
      <Box flexDirection="column" marginTop={1}>
        {/* 마크다운 → ANSI 로 렌더해 보기 쉽게. */}
        <Text>{renderMarkdown(turn.text)}</Text>
        {turn.saved && <Text dimColor>💡 저장됨</Text>}
      </Box>
    );
  }
  if (turn.kind === "note") {
    return (
      <Box marginTop={1}>
        <Text dimColor>· {turn.text}</Text>
      </Box>
    );
  }
  return (
    <Box marginTop={1}>
      <Text color="red">[오류] {turn.text}</Text>
    </Box>
  );
}
