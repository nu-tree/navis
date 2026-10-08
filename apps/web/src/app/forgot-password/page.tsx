import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = { title: "비밀번호 찾기 · 나비스" };

export default async function Page() {
  return (
    <AuthShell title="비밀번호를 잊으셨나요?" description="가입한 이메일로 비밀번호를 새로 정하는 링크를 보내 드려요.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
