import { Box, Text } from "ink";
import Spinner from "ink-spinner";

// 응답 진행 중 표시 — 누적 스트리밍 텍스트(있으면) + 스피너/현재 활동 라벨.
export function PendingView({
  streamingText,
  activity,
}: {
  streamingText: string;
  activity: string;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      {streamingText ? <Text>{streamingText}</Text> : null}
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text dimColor> {activity || "생각 중..."}</Text>
      </Box>
    </Box>
  );
}
