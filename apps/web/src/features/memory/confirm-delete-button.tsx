"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onConfirm: () => void;
  disabled?: boolean;
  label?: string;
};

/**
 * 두 번 눌러야 지워지는 버튼. 기억 삭제는 되돌릴 수 없다 — 한 번의 오클릭으로 사라지면 안 된다.
 * 브라우저 confirm() 대신 버튼이 "정말 삭제"로 바뀌고, 포커스를 잃으면 원래대로 돌아간다.
 */
export const ConfirmDeleteButton = ({ onConfirm, disabled, label = "삭제" }: Readonly<Props>) => {
  const [armed, setArmed] = useState(false);

  return armed ? (
    <Button
      variant="destructive"
      size="sm"
      autoFocus
      onBlur={() => setArmed(false)}
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
    >
      정말 {label}
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={() => setArmed(true)}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 />
    </Button>
  );
};
