"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdatePassword } from "@/hooks/apis/auth/use-update-password";
import { AuthField } from "./auth-field";
import { PasswordInput } from "./password-input";

/** Supabase 기본 최소 길이와 맞춘다 — 대시보드에서 올리면 서버가 weak_password 로 거절한다. */
const MIN_LENGTH = 8;

export const SetPasswordForm = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { mutate: update, isPending, error } = useUpdatePassword();

  const tooShort = password.length > 0 && password.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;
  const message = tooShort
    ? `${MIN_LENGTH}자 이상으로 써 주세요.`
    : mismatch
      ? "두 비밀번호가 달라요."
      : (error?.message ?? null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (password.length >= MIN_LENGTH && password === confirm) update(password);
      }}
      className="space-y-4"
    >
      <AuthField icon={<Lock />} label="새 비밀번호" htmlFor="password">
        <PasswordInput
          id="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="h-11 pl-10"
        />
      </AuthField>
      <AuthField icon={<Lock />} label="한 번 더" htmlFor="confirm">
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="h-11 pl-10"
        />
      </AuthField>

      {message ? (
        <p role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          {message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={isPending || tooShort || mismatch || !password || !confirm}
        className="h-11 w-full text-base font-semibold"
      >
        {isPending ? <Loader2 className="animate-spin" /> : null}
        비밀번호 정하고 시작하기
      </Button>
    </form>
  );
};
