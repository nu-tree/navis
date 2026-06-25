import { Box, Text } from "ink";
import { modelLabel } from "src/utils/models.js";

// 화면 맨 아래 상태줄 — 프로젝트 · 현재 모델 · 방금 저장 여부 / 명령 힌트.
export function StatusBar({
  projectContext,
  model,
  justSaved,
}: {
  projectContext: string | undefined;
  model: string;
  justSaved: boolean;
}) {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text dimColor>
        {projectContext ? `📁 ${projectContext}` : "📁 (개인 기억)"}
        {` · 🧠 ${modelLabel(model)}`}
        {justSaved ? " · 💡 저장됨" : ""}
      </Text>
      <Text dimColor>/ 명령어 · /model 모델 · /quit 종료</Text>
    </Box>
  );
}
