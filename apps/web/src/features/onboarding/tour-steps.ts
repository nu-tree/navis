import type { DriveStep } from "driver.js";

/** 화면의 어느 요소를 짚는지 — 컴포넌트에 같은 data-tour 값을 단다. */
const at = (name: string) => `[data-tour="${name}"]`;

/**
 * 첫 방문 튜토리얼 — 실제 버튼을 하나씩 짚으며 무엇을 할 수 있고 왜 좋은지 말한다.
 * 문구는 여기서만 고친다. 요소가 화면에 없으면(모바일에서 닫힌 사이드바 등) 가운데 말풍선으로 보인다.
 */
export const tourSteps = ({ tokenRegistered }: { tokenRegistered: boolean }): DriveStep[] => [
  {
    popover: {
      title: "나비스에 오신 걸 환영해요 👋",
      description:
        "나비스는 <b>나를 기억하는 비서</b>예요. 평소처럼 대화하면 결정한 것 · 할 일 · 알게 된 것을 알아서 기억하고, " +
        "나중에 물어보면 그 기억으로 답해요.<br/><br/>" +
        "보통 AI 는 대화방을 닫으면 잊지만, 나비스는 방이 바뀌어도 며칠이 지나도 기억이 이어져요. 화면을 한 바퀴 둘러볼게요.",
    },
  },
  {
    element: at("chat-input"),
    popover: {
      title: "여기에 그냥 말하면 돼요",
      description:
        "\"저장해\"라고 할 필요 없어요. 기억할 만한 말이면 나비스가 판단해서 남기고, 답 아래에 <b>기억에 남겼어요</b>가 붙어요.<br/><br/>" +
        "<i>예) 이번 분기엔 나비스에 집중하기로 했어</i><br/><i>예) 배포 관련해서 내가 뭐라고 했었지?</i><br/><i>예) 오늘 한 일 정리해줘</i>",
      side: "top",
      align: "start",
    },
  },
  {
    element: at("attach"),
    popover: {
      title: "사진도 보여줄 수 있어요",
      description:
        "이 버튼으로 고르거나, 스크린샷을 <b>⌘V</b> 로 붙여넣거나, 입력창에 끌어다 놓으면 이미지를 보고 답해요. 큰 이미지는 알아서 줄여 보내요.",
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
    element: at("new-chat"),
    popover: {
      title: "주제가 바뀌면 새 대화로",
      description: "대화방을 나눠도 기억은 하나로 이어져요. 다른 방에서 한 이야기도 \"전에 뭐라고 했지?\"로 찾을 수 있어요.",
      side: "right",
      align: "start",
    },
  },
  {
    element: at("memories"),
    popover: {
      title: "나비스가 뭘 기억하는지 직접 봐요",
      description:
        "쌓인 기억을 훑어보고 <b>틀린 건 고치고, 필요 없는 건 지워요</b>. 할 일은 체크로 끝내고, 비슷한 기억은 하나로 정리하고, 전체를 파일로 내보낼 수도 있어요.<br/><br/>" +
        "자동으로 쌓이는 만큼, 바로잡을 수 있어야 믿고 쓸 수 있으니까요.",
      side: "right",
      align: "end",
    },
  },
  {
    element: at("help"),
    popover: {
      title: "이 안내는 언제든 다시",
      description: "헷갈리면 여기를 눌러 이 둘러보기를 다시 볼 수 있어요.",
      side: "right",
      align: "end",
    },
  },
  {
    element: at("settings"),
    popover: tokenRegistered
      ? {
          title: "준비 끝났어요 🎉",
          description: "Claude 토큰이 이미 등록돼 있어요. 이제 입력창에 아무 말이나 걸어 보세요. 내 기억은 나만 봐요.",
          side: "right",
          align: "end",
        }
      : {
          title: "마지막으로, 여기서 토큰 등록",
          description:
            "나비스는 <b>내 Claude 구독</b>으로 답해요. 설정에서 Claude 토큰을 한 번 등록하면 바로 대화할 수 있어요 " +
            "(터미널에서 <code>claude setup-token</code> 으로 발급). 토큰은 암호화해 보관하고 다시 보여주지 않아요.",
          side: "right",
          align: "end",
        },
  },
];
