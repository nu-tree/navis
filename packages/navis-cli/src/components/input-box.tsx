import { Box, Text } from "ink";
import TextInput from "ink-text-input";

// 하단 입력선 — 둥근 테두리 + 프롬프트 기호 + ink-text-input.
// 타이핑·커서·Enter 제출은 TextInput 이 처리한다(방향키 위/아래는 App 이 가로챔).
export function InputBox({
  value,
  onChange,
  onSubmit,
  focus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focus: boolean;
}) {
  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text color="green">{"› "}</Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={focus}
        placeholder="메시지 입력 — '/' 입력 시 명령어 (방향키 선택)"
      />
    </Box>
  );
}
