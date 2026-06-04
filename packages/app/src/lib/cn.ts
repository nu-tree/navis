import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// shadcn 스타일 className 병합 유틸 (조건부 + 충돌 해소)
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
