import { Box, Text } from "ink";
import type { SlashCommand } from "./commands.js";

// 입력선 위에 뜨는 슬래시 자동완성 메뉴. 강조(index) 는 App 의 방향키 핸들러가 옮긴다.
export function SlashMenu({ items, index }: { items: SlashCommand[]; index: number }) {
  return (
    <Box flexDirection="column" marginLeft={2}>
      {items.map((c, i) => {
        const active = i === index;
        return (
          <Box key={c.name}>
            <Text color={active ? "green" : "gray"}>{active ? "❯ " : "  "}</Text>
            <Text color={active ? "green" : undefined} bold={active}>
              {c.name}
            </Text>
            <Text dimColor>{"  " + c.desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
