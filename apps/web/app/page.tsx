// 임시 랜딩. 실제 웹 UI(채팅·기억 브라우저)는 다음 단계에서 만든다 —
// 지금은 배포가 살아있는지 눈으로 확인하는 용도다.
export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>navis</h1>
        <p style={{ color: "#9a9aa8", margin: "0 0 20px", lineHeight: 1.6 }}>
          기억(namory) + 에이전트(navis) 백엔드가 떠 있습니다. 웹 UI 는 준비 중입니다.
        </p>
        <p style={{ color: "#6a6a78", margin: 0, fontSize: 13, lineHeight: 1.8 }}>
          <code>/api/health</code> — 헬스체크
          <br />
          <code>/api/mcp</code> — 기억 MCP (외부 클라이언트용)
        </p>
      </div>
    </main>
  );
}
