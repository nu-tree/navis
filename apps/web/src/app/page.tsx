import { AppShell } from "@/components/layout/app-shell";

export default function Home() {
  return (
    <AppShell>
      {/* 자리표시자 — 다음 단계에서 chat-view(메시지 목록 + 입력창)로 교체된다.
          지금은 셸의 스크롤 경계가 맞는지 확인하는 용도다: 이 영역이
          자기 안에서 스크롤하고 페이지 전체는 움직이지 않아야 한다. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              여기에 채팅이 들어갑니다
            </p>
          </div>
          {/* 스크롤 경계 확인용 블록. 이게 페이지를 늘리지 않고 이 영역만
              스크롤해야 정상이다. */}
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
            >
              스크롤 확인용 블록 {i + 1}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
