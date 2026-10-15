"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  /** 복사할 글. */
  text: string;
};

/** 글 하나를 클립보드에 복사하는 작은 버튼. 복사되면 잠깐 체크로 바뀐다. */
export const CopyButton = ({ text, ...props }: Readonly<Props>) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 권한이 없으면(일부 인앱 브라우저) 조용히 넘어간다 — 글은 화면에 그대로 있어 직접 고를 수 있다.
    }
  };

  return (
    <Button type="button" variant="ghost" size="icon" aria-label={copied ? "복사됨" : "복사"} onClick={copy} {...props}>
      {copied ? <Check /> : <Copy />}
    </Button>
  );
};
