import type { DriveStep } from "driver.js";

/** 화면의 어느 요소를 짚는지 — 컴포넌트에 같은 data-tour 값을 단다. */
const at = (name: string) => `[data-tour="${name}"]`;

/**
 * 첫 방문 튜토리얼 — 실제 버튼을 하나씩 짚으며 무엇을 할 수 있고 왜 좋은지 말한다.
 * 문구는 여기서만 고친다. 요소가 화면에 없으면 가운데 말풍선으로 보인다.
 */
export const tourSteps = ({ tokenRegistered }: { tokenRegistered: boolean }): DriveStep[] => [
  {
    popover: {
      title: "나비스에 오신 걸 환영해요 👋",
      description:
        "나비스는 <b>쓸수록 나를 더 잘 아는 비서</b>예요.<br/><br/>" +
        "보통 AI 는 대화방을 닫으면 처음부터 다시 설명해야 하죠. 나비스는 대화하면서 " +
        "내가 결정한 것 · 할 일 · 알게 된 것을 <b>기억으로 쌓아요</b>. 며칠이 지나도 이어지고, " +
        "기억이 쌓일수록 설명 없이도 내 맥락에 맞게 답해요.<br/><br/>" +
        "그래서 나비스에서는 <b>기억이 곧 실력</b>이에요. 화면을 한 바퀴 둘러볼게요.",
    },
  },
  {
    element: at("chat-input"),
    popover: {
      title: "여기에 그냥 말하면 돼요",
      description:
        "\"저장해\"라고 할 필요 없어요. 기억할 만한 말이면 나비스가 판단해서 남기고, 답 아래에 <b>기억에 남겼어요</b>가 붙어요.<br/><br/>" +
        "<i>예) 17일에 친구 결혼식 있어</i><br/><i>예) 이사 관련해서 내가 저번에 뭐라고 했었지?</i><br/><i>예) 이번 주에 한 일 정리해줘</i>",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: "때가 되면 먼저 말을 걸어요 ⏰",
      description:
        "나중에 할 일을 맡겨 두면, 그때가 됐을 때 나비스가 <b>먼저 이 대화방에 말을 걸어요</b>. 창을 닫아 둬도 알림이 와요.<br/><br/>" +
        "<i>예) 16일 저녁에 축의금 챙기라고 알려줘</i><br/><i>예) 매일 아침 8시에 오늘 할 일 정리해줘</i><br/><i>예) 금요일마다 이번 주 지출 정리해줘</i><br/><br/>" +
        "\"17일에 결혼식 있어\"처럼 날짜가 걸린 말을 하면 나비스가 먼저 \"전날 짚어 드릴까요?\" 하고 물어보기도 해요.",
    },
  },
  {
    element: at("attach"),
    popover: {
      title: "사진 · 문서도 보여줄 수 있어요",
      description:
        "이 버튼으로 고르거나, 스크린샷을 <b>⌘V</b> 로 붙여넣거나, 입력창에 끌어다 놓으면 보고 답해요.<br/>" +
        "PDF · Word · Excel · PowerPoint · 한글(hwpx) · 텍스트 파일도 읽어요. 큰 이미지는 알아서 줄여 보내요.",
      side: "top",
      align: "start",
    },
  },
  {
    element: at("model"),
    popover: {
      title: "답하는 모델을 고를 수 있어요",
      description: "깊게 생각해야 하면 Opus, 빠른 답이 필요하면 가벼운 모델로. 기억은 모델과 상관없이 이어져요.",
      side: "top",
      align: "start",
    },
  },
  {
    element: at("memories"),
    popover: {
      title: "나비스가 뭘 기억하는지 직접 봐요",
      description:
        "쌓인 기억을 훑어보고, <b>틀린 건 고쳐서 바로잡아요</b>. 할 일은 체크로 끝내요.<br/><br/>" +
        "<b>정리하거나 비울 필요는 없어요.</b> 기억은 나만 보고 다른 사람과 섞이지 않아요. " +
        "주제가 달라도 서로 꼬이지 않고, 많이 쌓일수록 나비스가 나를 더 잘 알아요.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: at("help"),
    popover: {
      title: "이 안내는 언제든 다시",
      description: "헷갈리면 여기를 눌러 이 둘러보기를 다시 볼 수 있어요.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: at("settings"),
    popover: {
      title: "마지막으로 설정을 둘러볼게요",
      description: tokenRegistered
        ? "Claude 는 이미 연결돼 있어요. 설정에는 그 밖에도 <b>Claude 앱에서 내 나비스 쓰기</b>와 <b>답 도착 알림</b>이 있어요. 같이 열어 볼게요."
        : "나비스가 답하려면 <b>Claude 연결</b>이 하나 필요해요. 설정에서 어디서 하는지, 그 밖에 뭐가 있는지 같이 열어 볼게요.",
      side: "bottom",
      align: "end",
    },
  },
];

/**
 * 설정 화면 둘러보기 — 대화 화면 튜토리얼의 마지막 버튼이 이 화면을 열고 이어서 짚는다.
 * 칸마다 무엇이고 왜 필요한지 말한다. 문구는 여기서만 고친다.
 */
export const settingsTourSteps = ({ tokenRegistered }: { tokenRegistered: boolean }): DriveStep[] => [
  {
    element: at("settings-claude"),
    popover: tokenRegistered
      ? {
          title: "① Claude 연결 ✓",
          description:
            "나비스는 <b>내 Claude 구독</b>으로 답해요. 이미 연결돼 있어요 — 토큰이 만료되면 여기서 새로 붙여 넣으면 돼요.",
          side: "bottom",
          align: "start",
        }
      : {
          title: "① 먼저 Claude 연결",
          description:
            "나비스는 <b>내 Claude 구독</b>(Pro · Max)으로 답해요. 여기 나온 순서대로 명령을 <b>복사 버튼</b>으로 터미널에 붙여 넣고, " +
            "나온 토큰을 붙여 넣으면 끝이에요. 2–3분이면 돼요.<br/><br/>" +
            "붙여 넣으면 나비스가 바로 연결을 확인해요. 토큰은 암호화해 보관하고 다시 보여주지 않아요.",
          side: "bottom",
          align: "start",
        },
  },
  {
    element: at("settings-connect"),
    popover: {
      title: "② Claude 에서도 내 나비스를 🔌",
      description:
        "claude.ai · Claude 데스크톱 · 휴대폰 앱 · Claude Code 에 나비스를 붙이면, 거기서 일하다가도 " +
        "<b>내 기억을 찾아보고 정한 것을 바로 남겨요</b>. 어디서 말하든 기억은 한곳에 쌓여요.<br/><br/>" +
        "탭에서 쓰는 앱을 고르고 <b>주소 하나를 붙여 넣은 뒤 허용</b>만 누르면 돼요. 터미널은 필요 없어요. 연결한 앱은 여기 목록에 보이고 언제든 끊을 수 있어요.",
      side: "top",
      align: "start",
    },
  },
  {
    element: at("settings-notify"),
    popover: {
      title: "③ 답 도착 알림",
      description:
        "켜 두면 나비스 창을 닫아도 답이 오거나 <b>약속한 때가 되면</b> 알려 드려요. 기기마다 따로 켜요.",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: tokenRegistered ? "준비 끝났어요 🎉" : "이제 Claude 만 연결하면 돼요",
      description: tokenRegistered
        ? "이제 대화 화면에서 아무 말이나 걸어 보세요. 내 기억은 나만 봐요. 이 안내는 위쪽 <b>?</b> 버튼으로 언제든 다시 볼 수 있어요."
        : "맨 위 <b>Claude 연결</b>부터 해 주세요. 끝나면 바로 대화할 수 있어요. 이 안내는 대화 화면 위쪽 <b>?</b> 버튼으로 언제든 다시 볼 수 있어요.",
    },
  },
];
