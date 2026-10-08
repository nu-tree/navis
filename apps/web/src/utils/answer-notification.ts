// 답이 도착했다는 표시 — 질문해 두고 다른 탭에 가 있는 사람을 부른다.
//
// 두 가지를 함께 쓴다.
// - 브라우저 알림(Notification): 허락한 사람에게만. 탭이 **보일 때는** 띄우지 않는다 — 보고 있는데
//   알림까지 뜨면 소음이다.
// - 탭 제목 표시: 알림을 거절했거나 지원하지 않는 브라우저(아이폰 사파리 등)에서도 보인다.
//   탭으로 돌아오면 원래 제목으로 되돌린다.

const BADGE = "● ";

const supported = () => typeof window !== "undefined" && "Notification" in window;

/**
 * 처음 한 번 알림 권한을 묻는다. 사파리는 사용자 동작(클릭 · 엔터) 안에서만 물을 수 있으므로
 * 보내기 처리의 **첫 await 전에** 부른다. 이미 답한 사람에게는 다시 묻지 않는다.
 */
export const requestAnswerNotificationPermission = () => {
  if (!supported() || Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => undefined);
};

/** 알림 본문 — 마크다운 기호를 걷어내고 앞부분만. */
const excerpt = (text: string) => {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~|[\]()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
};

let restoreTitle: (() => void) | null = null;

/** 탭 제목 앞에 점을 찍고, 탭이 다시 보이면 떼어낸다. 여러 답이 와도 한 번만 붙인다. */
const markTitle = () => {
  if (restoreTitle) return;
  const original = document.title;
  document.title = `${BADGE}${original}`;
  const onVisible = () => {
    if (document.hidden) return;
    restoreTitle?.();
  };
  restoreTitle = () => {
    document.title = original;
    document.removeEventListener("visibilitychange", onVisible);
    restoreTitle = null;
  };
  document.addEventListener("visibilitychange", onVisible);
};

type NotifyInput = {
  /** 같은 방의 알림은 새 것으로 갈아끼운다(tag). */
  conversationId: string;
  body: string;
  /** 알림을 누르면 — 그 방을 연다. */
  onClick?: () => void;
};

/** 탭이 가려져 있을 때만 알린다. */
export const notifyAnswer = ({ conversationId, body, onClick }: NotifyInput) => {
  if (typeof document === "undefined" || !document.hidden) return;
  markTitle();
  if (!supported() || Notification.permission !== "granted") return;
  try {
    const notification = new Notification("나비스", {
      body: excerpt(body) || "답변이 도착했어요.",
      icon: "/logo.png",
      tag: conversationId,
    });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch (err) {
    // 안드로이드 크롬은 페이지에서 new Notification 을 막는다(서비스 워커 전용). 제목 표시로 충분하다.
    console.warn("[answer-notification]", err);
  }
};
