import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { SetPasswordForm } from "@/features/auth/set-password-form";

export const metadata: Metadata = { title: "비밀번호 정하기 · 나비스" };

// 메일 링크(/auth/confirm)를 지나 로그인된 상태로 온다 — 초대받은 첫 로그인, 비밀번호 재설정 둘 다.
// 로그인돼 있지 않으면 proxy 가 로그인 화면으로 보낸다.
export default async function Page() {
  return (
    <AuthShell title="비밀번호 정하기" description="앞으로 로그인할 때 쓸 비밀번호를 정해 주세요.">
      <SetPasswordForm />
    </AuthShell>
  );
}
