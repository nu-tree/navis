import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // remotePatterns 를 두지 않았다 — 지금 원격 이미지를 쓰지 않는다.
    // 채팅 첨부는 사용자가 붙인 data URL 이라 next/image 를 타지 않는다.
    // 와일드카드(hostname: "**")를 열어두면 /_next/image?url=<임의 공개 URL> 로
    // 이 서버가 아무 호스트의 이미지를 받아 변환해주는 대역폭·CPU 증폭 벡터가 된다.
    // 실제로 원격 이미지를 쓰게 되면 그때 필요한 호스트만 명시적으로 추가한다.
  },
  compiler: {
    // 운영에서도 console.error / console.warn 은 남긴다 — 서버 로그에서
    // 실패 원인을 추적할 수 있어야 한다. 나머지 console 은 번들에서 제거.
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  // 컴포넌트 렌더를 자동 메모이제이션한다. babel-plugin-react-compiler 가
  // devDependency 로 있어야 동작한다(없으면 빌드가 실패한다).
  // 참고: experimental.turbopackRustReactCompiler 로 Babel 대신 네이티브 Rust
  // 판을 쓸 수 있다. 이 규모에서는 빌드 시간 차이가 측정되지 않아(3.9s vs 3.8s)
  // 안정판을 쓴다 — 빌드가 실제로 느려지면 그때 바꾼다.
  reactCompiler: true,
  typescript: {
    ignoreBuildErrors: false,
  },

  // Docker/셀프호스팅용 최소 산출물. 배포 방식이 정해지면 재검토한다
  // (Vercel 로 가면 필요 없다).
  output: "standalone",
  // 라우트 문자열을 타입으로 검사하고 LayoutProps/PageProps 를 생성한다.
  typedRoutes: true,
};

export default nextConfig;
