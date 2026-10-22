import type { Metadata } from "next";
import { AlertCircle } from "lucide-react";
import { oauthAuthorizeInputSchema } from "@navis/validation";
import { AuthShell } from "@/features/auth/auth-shell";
import { OAuthConsent } from "@/features/connect/oauth-consent";

export const metadata: Metadata = { title: "연결 허용 · 나비스" };

// MCP 인가의 동의 화면 — Claude 가 "나비스 연결"을 누르면 브라우저가 여기로 온다.
// 로그인이 안 돼 있으면 proxy.ts 가 로그인 화면으로 보냈다가 이 주소로 되돌린다.
export default async function Page({ searchParams }: PageProps<"/oauth/authorize">) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  const parsed = oauthAuthorizeInputSchema.safeParse({
    client_id: one("client_id"),
    redirect_uri: one("redirect_uri"),
    code_challenge: one("code_challenge"),
    code_challenge_method: one("code_challenge_method"),
    state: one("state"),
  });

  if (!parsed.success || one("response_type") !== "code") {
    return (
      <AuthShell title="연결 요청이 올바르지 않아요">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          이 주소는 Claude 같은 앱이 연결할 때 자동으로 여는 화면이에요. 앱에서 나비스 연결을 처음부터 다시 시작해 주세요.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <OAuthConsent input={parsed.data} />
    </AuthShell>
  );
}
