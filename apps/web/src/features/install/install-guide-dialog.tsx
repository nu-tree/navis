"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Guide = { title: string; steps: string[]; note?: string };

/**
 * 브라우저별 설치 방법. 설치 창을 띄울 수 없는 브라우저(사파리 · 파이어폭스 · 메신저 안 브라우저)와
 * 크롬이 아직 설치 창을 주지 않을 때 보여준다.
 */
const guideFor = (ua: string): Guide => {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (/KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//.test(ua)) {
    return {
      title: "브라우저에서 열어 주세요",
      steps: [
        "지금은 메신저 안의 브라우저라 설치할 수 없어요.",
        ios ? "오른쪽 아래 공유(또는 ⋯) 버튼 → 'Safari로 열기'를 눌러요." : "오른쪽 위 ⋮ 버튼 → '다른 브라우저로 열기'에서 크롬을 골라요.",
        "열린 브라우저에서 다시 '앱으로 설치'를 눌러요.",
      ],
    };
  }
  if (ios) {
    return {
      title: "아이폰 · 아이패드에 설치",
      steps: [
        "사파리에서 아래쪽(또는 주소창 옆) 공유 버튼 □↑ 을 눌러요.",
        "목록을 내려 '홈 화면에 추가'를 눌러요.",
        "오른쪽 위 '추가'를 누르면 홈 화면에 나비스 아이콘이 생겨요.",
      ],
      note: "설치한 나비스에서 설정 → 알림을 켜면 창을 닫아도 답 도착 알림이 와요.",
    };
  }
  if (/Firefox/.test(ua)) {
    return {
      title: "파이어폭스는 설치를 지원하지 않아요",
      steps: ["크롬이나 엣지에서 나비스를 열고 '앱으로 설치'를 눌러 주세요."],
    };
  }
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) {
    return {
      title: "맥 사파리에서 설치",
      steps: ["메뉴 막대의 '파일'을 눌러요.", "'Dock에 추가…'를 누르고 '추가'를 눌러요."],
    };
  }
  return {
    title: "크롬 · 엣지에서 설치",
    steps: [
      "주소창 오른쪽 끝의 설치 아이콘(모니터에 화살표)을 눌러요.",
      "안 보이면 오른쪽 위 메뉴(⋮ 또는 ⋯) → '앱' 또는 '전송, 저장, 공유'에서 '나비스 설치'를 찾아요.",
      "이미 설치했다면 시작 메뉴 · 런치패드 · 바탕화면에서 나비스를 열면 돼요.",
    ],
  };
};

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export const InstallGuideDialog = ({ open, onOpenChange }: Readonly<Props>) => {
  // 열렸을 때만 읽는다 — 열기는 클릭으로만 되므로 서버 렌더에서는 navigator 를 건드리지 않는다.
  if (!open) return null;
  const guide = guideFor(navigator.userAgent);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{guide.title}</DialogTitle>
          <DialogDescription>설치하면 주소창 없는 창으로 열리고, 홈 화면 · 작업 표시줄에서 바로 켤 수 있어요.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {guide.note ? <p className="text-xs text-muted-foreground">{guide.note}</p> : null}
      </DialogContent>
    </Dialog>
  );
};
