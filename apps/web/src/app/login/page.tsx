import { AlertCircle } from "lucide-react";
import { supabaseEnv } from "@/lib/supabase";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { LoginUnconfigured } from "@/features/auth/login-unconfigured";

export default async function Page({ searchParams }: PageProps<"/login">) {
  // 로그인 설정 여부는 서버에서 정한다 — 폼(클라이언트)을 내릴지 말지가 여기서 갈린다.
  const configured = supabaseEnv() !== null;
  // 메일 링크(/auth/confirm) 검증에 실패하면 여기로 온다 — 만료됐거나 이미 쓴 링크다.
  const linkFailed = (await searchParams).error === "link";

  return (
    <AuthShell>
      {linkFailed ? (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          링크가 만료됐거나 이미 사용됐어요. 비밀번호 찾기로 새 링크를 받아 주세요.
        </p>
      ) : null}
      {configured ? <LoginForm /> : <LoginUnconfigured />}
    </AuthShell>
  );
}
