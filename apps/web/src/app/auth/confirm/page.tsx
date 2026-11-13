import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";

export const metadata: Metadata = { title: "나비스 시작하기" };

// 메일 링크가 도착하는 곳 — 초대 · 비밀번호 재설정.
//   /auth/confirm?token_hash=…&type=invite|recovery&next=/auth/set-password
//
// ★ 여기서는 토큰을 쓰지 않고 버튼만 보여준다. 메일 링크 검사기가 미리 열어 봐도 토큰이 남아 있게 —
//   실제 검증은 버튼이 POST 하는 /auth/confirm/verify 가 한다(그 파일 주석).
export default async function Page({ searchParams }: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  const next = one(params.next);
  const recovery = type === "recovery";

  if (!tokenHash || !type) {
    return (
      <AuthShell title="링크를 열 수 없어요">
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          메일의 링크 주소가 온전하지 않아요. 메일의 버튼을 다시 눌러 보거나 새 링크를 받아 주세요.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/forgot-password">새 링크 받기</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={recovery ? "비밀번호 다시 정하기" : "나비스에 오신 걸 환영해요"}
      description={
        recovery
          ? "아래 버튼을 누르면 새 비밀번호를 정하는 화면으로 가요."
          : "아래 버튼을 누르면 앞으로 쓸 비밀번호를 정하는 화면으로 가요."
      }
    >
      <form method="post" action="/auth/confirm/verify">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" className="w-full">
          계속하기
        </Button>
      </form>
    </AuthShell>
  );
}
