import type { MetadataRoute } from "next";

// 설치형 앱(PWA). 크롬 · 엣지의 "앱 설치", 아이폰 사파리의 "홈 화면에 추가"로 독립 창에서 연다.
//
// ★ 서비스 워커는 두지 않는다 — 크롬은 이제 설치에 요구하지 않고, 로그인 뒤의 화면 · 스트림을
//   캐시하면 다른 회원의 화면이나 낡은 답이 남을 위험만 생긴다. 오프라인으로 쓸 일도 없다.
// ★ 이 파일과 아이콘은 src/proxy.ts 의 로그인 리다이렉트에서 빠져 있어야 한다. 브라우저는
//   manifest 를 쿠키 없이 받는다 — 리다이렉트되면 설치가 조용히 막힌다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "나비스",
    short_name: "나비스",
    description: "나를 기억하는 비서",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "ko",
    // globals.css 의 다크 --background 와 맞춘다 — 앱이 뜰 때 흰 화면이 번쩍이지 않게.
    background_color: "#0d0e1a",
    theme_color: "#0d0e1a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
