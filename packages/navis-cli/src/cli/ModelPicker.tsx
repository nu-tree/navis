import { Box, Text } from "ink";
import type { ModelOption } from "./models.js";

// /model (인자 없음) 입력 시 뜨는 모델 선택 모달. ↑/↓ 이동 · Enter 적용 · Esc 취소.
export function ModelPicker({
  options,
  index,
  current,
}: {
  options: ModelOption[];
  index: number;
  current: string;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginTop={1}
    >
      <Text color="cyan" bold>
        모델 선택 (↑/↓ 이동 · Enter 적용 · Esc 취소)
      </Text>
      {options.map((m, i) => {
        const active = i === index;
        return (
          <Box key={m.id}>
            <Text color={active ? "green" : "gray"}>
              {active ? "❯ " : "  "}
            </Text>
            <Text color={active ? "green" : undefined} bold={active}>
              {m.label}
            </Text>
            {m.id === current ? <Text dimColor>{"  (현재)"}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
