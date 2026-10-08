"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequestPasswordReset } from "@/hooks/apis/auth/use-request-password-reset";
import { AuthField } from "./auth-field";

export const ForgotPasswordForm = () => {
  const [email, setEmail] = useState("");
  const { mutate: request, isPending, isSuccess, error } = useRequestPasswordReset();

  if (isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          <b className="text-foreground">{email}</b> 이 가입된 이메일이면 비밀번호를 정하는 링크를 보냈어요.
          메일함(스팸함도)을 확인해 주세요.
        </p>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">로그인으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        request(email);
      }}
      className="space-y-4"
    >
      <AuthField icon={<Mail />} label="이메일" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="h-11 pl-10"
        />
      </AuthField>

      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {error.message}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending} className="h-11 w-full text-base font-semibold">
        {isPending ? <Loader2 className="animate-spin" /> : null}
        재설정 링크 보내기
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">로그인으로 돌아가기</Link>
      </Button>
    </form>
  );
};
