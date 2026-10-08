export const LoginUnconfigured = () => {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      로그인이 설정되지 않았어요. 로컬 개발 상태입니다 —
      <code className="mx-1 text-xs">NEXT_PUBLIC_SUPABASE_URL</code>과
      <code className="mx-1 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 채우면 켜집니다.
    </p>
  );
};
