import { LoginBrand } from "./login-brand";
import { NeuralBackdrop } from "./neural-backdrop";

type Props = {
  children: React.ReactNode;
  /** 카드 위 제목 · 설명. 로그인 화면은 비워 둔다(브랜드가 그 자리다). */
  title?: string;
  description?: string;
};

/** 로그인 · 비밀번호 찾기 · 비밀번호 정하기가 같이 쓰는 틀 — 배경 · 로고 · 유리 카드. */
export const AuthShell = ({ children, title, description }: Readonly<Props>) => {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-4 py-10">
      <NeuralBackdrop />

      <div className="relative w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
        <LoginBrand className="mb-8" />

        <div className="rounded-2xl border border-white/10 bg-card/60 p-6 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          {title ? (
            <div className="mb-5 space-y-1">
              <h2 className="font-semibold">{title}</h2>
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </div>
          ) : null}
          {children}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/70">나의 완벽한 비서</p>
      </div>
    </main>
  );
};
