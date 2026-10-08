import Image from "next/image";
import { cn } from "cn";
// 정적 import 로 /_next/static 에서 나가게 한다. "/logo.png" 경로로 두면 로그인 전에는
// proxy 가 그 요청까지 /login 으로 돌려보내 이미지가 깨진다.
import logo from "../../../public/logo.png";

type Props = React.HTMLAttributes<HTMLElement>;

export const LoginBrand = ({ className }: Readonly<Props>) => {
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-[28%] bg-primary/50 blur-2xl motion-safe:animate-pulse animation-duration-[4s]" />
        <Image
          src={logo}
          alt=""
          priority
          className="relative size-20 rounded-[24%] ring-1 ring-white/10"
        />
      </div>
      <h1 className="bg-linear-to-b from-white to-indigo-200 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
        나비스
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">제2의 뇌 — 기억하고, 대화한다</p>
    </div>
  );
};
