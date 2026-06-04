/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 — RN/Expo 용 Tailwind
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
