"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<typeof Input>, "type">;

/** 보기 토글이 붙은 비밀번호 입력. 토글 자리만큼 오른쪽 여백(pr-10)을 둔다. */
export const PasswordInput = ({ className, ...props }: Readonly<Props>) => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Input type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
        // Button 의 눌림 효과(translate-y-px)가 세로 가운데 정렬을 덮어 아이콘이 튀지 않게 고정한다.
        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground active:not-aria-[haspopup]:-translate-y-1/2"
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </>
  );
};
