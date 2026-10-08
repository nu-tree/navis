import { supabaseEnv } from "@/lib/supabase";
import { LoginBrand } from "@/features/auth/login-brand";
import { LoginForm } from "@/features/auth/login-form";
import { LoginUnconfigured } from "@/features/auth/login-unconfigured";
import { NeuralBackdrop } from "@/features/auth/neural-backdrop";

export default async function Page() {
  // 로그인 설정 여부는 서버에서 정한다 — 폼(클라이언트)을 내릴지 말지가 여기서 갈린다.
  const configured = supabaseEnv() !== null;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-10">
      <NeuralBackdrop />

      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
        <LoginBrand className="mb-8" />

        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          {configured ? <LoginForm /> : <LoginUnconfigured />}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">나의 완벽한 비서</p>
      </div>
    </main>
  );
}
