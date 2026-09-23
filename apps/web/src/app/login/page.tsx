"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, pending, error, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await signIn(email, password)) {
      // replace 로 옮긴다 — 뒤로가기로 로그인 화면에 돌아오지 않게.
      router.replace("/");
      router.refresh();
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-extrabold">나비스</h1>
          <p className="text-sm text-muted-foreground">
            제2의 뇌 — 기억하고 대화한다
          </p>
        </div>

        {configured ? (
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "확인 중…" : "로그인"}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
            로그인이 설정되지 않았어요. 로컬 개발 상태입니다 —
            <code className="mx-1 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>과
            <code className="mx-1 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를
            채우면 켜집니다.
          </p>
        )}
      </div>
    </main>
  );
}
