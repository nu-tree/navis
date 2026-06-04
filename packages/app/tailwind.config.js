/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 — RN/Expo 용 Tailwind
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 시맨틱 디자인 토큰 (shadcn 스타일, navis 다크 테마)
      colors: {
        background: '#0b0b0f',
        surface: '#15151b',
        border: '#2a2a33',
        input: '#1f1f27',
        ring: '#6366f1',
        foreground: '#fafafa',
        muted: {
          DEFAULT: '#1f1f27',
          foreground: '#9b9ba8',
        },
        card: {
          DEFAULT: '#1b1b22',
          foreground: '#fafafa',
        },
        primary: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: '#27272f',
          foreground: '#e5e5ea',
        },
        accent: {
          DEFAULT: '#8b5cf6',
          foreground: '#ffffff',
        },
        destructive: {
          DEFAULT: '#ef4444',
          foreground: '#ffffff',
        },
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
