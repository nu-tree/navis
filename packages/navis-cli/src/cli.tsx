import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { render, Box, Static, useApp, useInput, useStdout } from "ink";
import { config } from "navis/config.js";
import { detectProject } from "navis/project.js";
import { matchCommands } from "./cli/commands.js";
import { MODEL_OPTIONS } from "./cli/models.js";
import { SlashMenu } from "./cli/SlashMenu.js";
import { ModelPicker } from "./cli/ModelPicker.js";
import { TurnView } from "./cli/TurnView.js";
import { PendingView } from "./cli/PendingView.js";
import { InputBox } from "./cli/InputBox.js";
import { StatusBar } from "./cli/StatusBar.js";
import { useConversation } from "./cli/useConversation.js";
import { useModelPicker } from "./cli/useModelPicker.js";
import { useCommands } from "./cli/useCommands.js";

// navis CLI — Claude Code 스타일 Ink REPL.
// 대화 두뇌는 useConversation, 명령은 useCommands, 모델 모달은 useModelPicker, 화면은 cli/* 컴포넌트.
// 여기 App 은 키 입력 라우팅과 레이아웃 조립만 한다.

const projectContext = detectProject();

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(config.model);
  const [menuIndex, setMenuIndex] = useState(0);

  const {
    turns,
    addTurn,
    clearTurns,
    resetSession,
    pending,
    streamingText,
    activity,
    sendMessage,
  } = useConversation(projectContext);

  const picker = useModelPicker(model, setModel, addTurn);

  // 화면+스크롤백 클리어 시퀀스(/clear 용).
  const clearScreen = useCallback(() => stdout.write("\x1b[2J\x1b[3J\x1b[H"), [stdout]);
  const runCommand = useCommands({
    projectContext,
    addTurn,
    resetSession,
    clearTurns,
    clearScreen,
    setModel,
    openModelPicker: picker.open,
    exit,
  });

  // 슬래시 자동완성 후보(입력이 "/..."이고 응답 중/모달 중이 아닐 때만).
  const menuItems = useMemo(
    () => (!picker.active && !pending ? matchCommands(input) : []),
    [picker.active, pending, input],
  );
  // 입력이 바뀌면 강조를 맨 위로 되돌린다.
  useEffect(() => setMenuIndex(0), [input]);
  // submit 이 항상 유효 범위의 강조 인덱스를 읽도록 ref 로 미러링(클램프).
  const menuItemsRef = useRef(menuItems);
  menuItemsRef.current = menuItems;
  const clampedMenuIndex = Math.min(menuIndex, Math.max(0, menuItems.length - 1));
  const menuIndexRef = useRef(0);
  menuIndexRef.current = clampedMenuIndex;

  // 키 입력 라우팅: Ctrl+C 종료 → 모델 모달(열려 있으면 위임) → 슬래시 메뉴 방향키.
  // 일반 타이핑·커서·Enter 제출은 TextInput 이 처리(방향키 위/아래만 여기서 가로챔).
  useInput((ch, key) => {
    if (key.ctrl && ch === "c") {
      exit();
      return;
    }
    if (pending) return;
    if (picker.active) {
      picker.handleKey(key);
      return;
    }
    if (menuItems.length) {
      if (key.upArrow) setMenuIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setMenuIndex((i) => Math.min(menuItems.length - 1, i + 1));
      else if (key.escape) setInput("");
    }
  });

  const submit = useCallback(
    async (line: string) => {
      const trimmed = line.trim();
      setInput("");
      if (!trimmed) return;

      // ── 슬래시 명령 ──────────────────────────────────────────────
      if (trimmed.startsWith("/")) {
        const cmd0 = trimmed.split(/\s+/)[0];
        const arg = trimmed.slice(cmd0.length).trim();
        // 인자가 없으면 메뉴에서 강조된 후보로 확장(방향키 선택 → Enter 로 실행).
        let name = cmd0;
        if (!arg) {
          const items = menuItemsRef.current;
          if (items.length) name = items[menuIndexRef.current].name;
        }
        if (runCommand(name, arg)) return;
        addTurn({ kind: "note", text: `알 수 없는 명령: ${cmd0} ( /help 로 목록 )` });
        return;
      }

      // ── 일반 메시지 ──────────────────────────────────────────────
      await sendMessage(trimmed, model);
    },
    [model, addTurn, runCommand, sendMessage],
  );

  const lastAssistant = [...turns].reverse().find((t) => t.kind === "assistant");
  const justSaved = lastAssistant?.kind === "assistant" ? lastAssistant.saved : false;

  return (
    <Box flexDirection="column">
      <Static items={turns}>{(turn) => <TurnView key={turn.id} turn={turn} />}</Static>

      {pending && <PendingView streamingText={streamingText} activity={activity} />}

      {picker.active ? (
        <ModelPicker options={MODEL_OPTIONS} index={picker.index} current={model} />
      ) : menuItems.length ? (
        <SlashMenu items={menuItems} index={menuIndexRef.current} />
      ) : null}

      <InputBox
        value={input}
        onChange={setInput}
        onSubmit={submit}
        focus={!picker.active && !pending}
      />

      <StatusBar projectContext={projectContext} model={model} justSaved={justSaved} />
    </Box>
  );
}

// 시작 배너 — 한번만 stdout에 흘려 보내고 Ink가 그 아래에서 그리기 시작.
console.log(`navis code${projectContext ? ` · 프로젝트: ${projectContext}` : ""}`);

render(<App />);
