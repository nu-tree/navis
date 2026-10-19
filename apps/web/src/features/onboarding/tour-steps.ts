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
    popover: tokenRegistered
      ? {
          title: "준비 끝났어요 🎉",
          description: "Claude 토큰이 이미 등록돼 있어요. 이제 입력창에 아무 말이나 걸어 보세요. 내 기억은 나만 봐요.",
          side: "bottom",
          align: "end",
        }
      : {
          title: "마지막으로, 여기서 Claude 연결",
          description:
            "나비스는 <b>내 Claude 구독</b>(Pro · Max)으로 답해요. 설정을 열면 Mac · Windows 별로 순서가 나와요 — " +
            "명령을 <b>복사 버튼</b>으로 터미널에 붙여 넣고, 나온 토큰을 붙여 넣으면 끝이에요. 2–3분이면 돼요.<br/><br/>" +
            "붙여 넣으면 나비스가 바로 연결을 확인해요. 토큰은 암호화해 보관하고 다시 보여주지 않아요.",
          side: "bottom",
          align: "end",
        },
  },
];
