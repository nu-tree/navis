"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pushState, subscribePush, unsubscribePush, type PushState } from "@/utils/push-subscription";

/** 상태별 안내 — 켜고 끌 수 없는 상태는 왜 그런지와 어떻게 하면 되는지를 말한다. */
const NOTE: Record<Exclude<PushState, "on" | "off">, string> = {
  unsupported:
    "이 브라우저는 앱 알림을 받을 수 없어요. 아이폰은 사파리에서 공유 → '홈 화면에 추가'로 설치한 나비스에서 켤 수 있어요.",
  disabled: "서버에 알림이 아직 설정되지 않았어요. 관리자에게 알려 주세요.",
  denied: "알림을 차단해 두셨어요. 주소창 왼쪽 자물쇠(사이트 설정)에서 알림을 허용한 뒤 다시 와 주세요.",
};

/** 이 기기의 답 도착 알림 — 창을 닫아도 온다(웹 푸시). 기기마다 따로 켠다. */
export const NotificationSettings = () => {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pushState().then(setState, () => setState("unsupported"));
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (state === "on") {
        await unsubscribePush();
      } else if ((await Notification.requestPermission()) === "granted") {
        await subscribePush();
      }
      setState(await pushState());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card/40 p-5">
      <div className="space-y-1">
        <h2 className="font-semibold">알림</h2>
        <p className="text-sm text-muted-foreground">
          답이 도착하면 이 기기로 알려 드려요. 나비스 창을 닫아 둬도 와요. 기기마다 따로 켜요.
        </p>
      </div>

      {state === null ? (
        <Skeleton className="h-9 w-32" />
      ) : state === "on" || state === "off" ? (
        <Button variant={state === "on" ? "outline" : "default"} disabled={busy} onClick={() => void toggle()}>
          {state === "on" ? <BellOff /> : <Bell />}
          {state === "on" ? "이 기기 알림 끄기" : "이 기기 알림 켜기"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{NOTE[state]}</p>
      )}
    </section>
  );
};
