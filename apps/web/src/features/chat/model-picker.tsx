"use client";

import { ChevronDown } from "lucide-react";
import { SELECTABLE_MODELS, type Model } from "@navis/validation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 사용자에게 보일 이름. 목록 자체는 @navis/validation 이 단일 출처다 —
// 여기서 새 모델을 추가하면 서버가 거부한다.
const LABELS: Record<Model, string> = {
  "claude-opus-5": "Opus",
  "claude-sonnet-5": "Sonnet",
  "claude-haiku-4-5-20251001": "Haiku",
};

type Props = {
  value: Model;
  onChange: (model: Model) => void;
  disabled?: boolean;
};

export const ModelPicker = ({ value, onChange, disabled }: Readonly<Props>) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="gap-1 text-xs text-muted-foreground"
        aria-label="모델 선택"
      >
        {LABELS[value]}
        <ChevronDown className="size-3.5" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start">
      {SELECTABLE_MODELS.map((model) => (
        <DropdownMenuItem
          key={model}
          onSelect={() => onChange(model)}
          className={model === value ? "font-semibold" : undefined}
        >
          {LABELS[model]}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
);
