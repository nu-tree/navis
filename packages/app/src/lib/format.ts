// ISO 문자열 → "오후 3:42" 형식
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ISO 문자열 → "26.06.04" 형식
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
}
