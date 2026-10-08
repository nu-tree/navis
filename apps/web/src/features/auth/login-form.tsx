"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthField } from "./auth-field";
import { PasswordInput } from "./password-input";
import { useAuth } from "./use-auth";

export const LoginForm = () => {
  const router = useRouter();
  const { signIn, pending, error } = useAuth();
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
    <form onSubmit={submit} className="space-y-4">
      <AuthField icon={<Mail />} label="이메일" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          className="h-11 pl-10"
        />
      </AuthField>

      <AuthField icon={<Lock />} label="비밀번호" htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-invalid={error ? true : undefined}
          className="h-11 pl-10"
        />
      </AuthField>

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pending}
        className="group h-11 w-full bg-linear-to-r from-primary to-accent text-base font-semibold shadow-lg shadow-primary/25 hover:from-primary/90 hover:to-accent/90"
      >
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            확인 중…
          </>
        ) : (
          <>
            로그인
            <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </Button>
    </form>
  );
};
