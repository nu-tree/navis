/**
 * 겨울 밤 장식 — 전구 줄 · 내리는 눈 · 침엽수 실루엣(2026-11-13 사용자 요청, 레퍼런스: 겨울 음악회 포스터).
 *
 * 전부 aria-hidden · pointer-events-none 이다. 글을 가리지 않게 옅게 두고, 움직임을 줄이라는 설정이면
 * 멈춘다(globals.css 의 navis-flake · navis-bulb). 위치는 고정된 표에서 뽑는다 — 렌더마다 Math.random 을
 * 쓰면 서버 · 브라우저 결과가 달라 하이드레이션이 깨진다.
 */

/**
 * 0~1 의 고정된 수열. 같은 i 면 늘 같은 값이다.
 * ★ 소수 셋째 자리로 자른다 — Math.sin 의 끝자리는 서버(Node)와 브라우저에서 미세하게 달라, 그대로 쓰면
 *   style 값이 어긋나 하이드레이션 경고가 난다(실측).
 */
const seeded = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 1000) / 1000;
};
/** style 문자열은 자릿수를 고정해 서버 · 브라우저가 같은 글자를 내게 한다. */
const fixed = (n: number) => n.toFixed(2);

const FLAKES = Array.from({ length: 46 }, (_, i) => ({
  left: seeded(i) * 100,
  size: 2 + seeded(i + 100) * 4,
  fall: 12 + seeded(i + 200) * 14,
  delay: -seeded(i + 300) * 26,
  drift: (seeded(i + 400) - 0.5) * 80,
  opacity: 0.25 + seeded(i + 500) * 0.45,
}));

/** 내리는 눈. 부모가 relative 여야 한다. */
export function Snowfall({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="navis-flake absolute -top-4 rounded-full bg-white"
          style={
            {
              left: `${fixed(f.left)}%`,
              width: `${fixed(f.size)}px`,
              height: `${fixed(f.size)}px`,
              opacity: fixed(f.opacity),
              "--fall": `${fixed(f.fall)}s`,
              "--delay": `${fixed(f.delay)}s`,
              "--drift": `${fixed(f.drift)}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 늘어진 전선 하나의 전구 위치 — 양 끝을 잇는 포물선 위에 고르게. */
const swag = (x0: number, x1: number, y: number, sag: number, count: number) =>
  Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count;
    return { x: x0 + (x1 - x0) * t, y: y + 4 * sag * t * (1 - t) };
  });

const SWAGS = [
  { x0: -40, x1: 420, y: 6, sag: 34, count: 7 },
  { x0: 420, x1: 860, y: 6, sag: 30, count: 7 },
  { x0: 860, x1: 1300, y: 6, sag: 36, count: 7 },
];

/** 위쪽에 걸린 전구 줄. 높이는 고정, 넓은 화면에서는 양옆이 잘린다(원이 찌그러지지 않게). */
export function StringLights({ className = "" }: Readonly<{ className?: string }>) {
  let n = 0;
  return (
    <svg
      aria-hidden
      viewBox="0 0 1260 64"
      preserveAspectRatio="xMidYMin slice"
      className={`pointer-events-none h-16 w-full ${className}`}
    >
      <defs>
        <radialGradient id="navis-bulb-glow">
          <stop offset="0%" stopColor="#fffcae" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fffcae" stopOpacity="0" />
        </radialGradient>
      </defs>
      {SWAGS.map((s) => (
        <path
          key={s.x0}
          d={`M ${s.x0} ${s.y} Q ${(s.x0 + s.x1) / 2} ${s.y + 2 * s.sag} ${s.x1} ${s.y}`}
          fill="none"
          stroke="#121527"
          strokeWidth="1.4"
          opacity="0.9"
        />
      ))}
      {SWAGS.flatMap((s) =>
        swag(s.x0, s.x1, s.y, s.sag, s.count).map((b) => {
          const i = n++;
          return (
            <g
              key={i}
              className="navis-bulb"
              style={{ "--delay": `${fixed(-seeded(i + 700) * 3)}s`, "--blink": `${fixed(2.6 + seeded(i + 800) * 2)}s` } as React.CSSProperties}
            >
              <circle cx={b.x} cy={b.y + 7} r="13" fill="url(#navis-bulb-glow)" />
              <rect x={b.x - 1.6} y={b.y} width="3.2" height="3.5" rx="0.8" fill="#121527" />
              <ellipse cx={b.x} cy={b.y + 7.5} rx="4" ry="5" fill="#fffcae" />
            </g>
          );
        }),
      )}
    </svg>
  );
}

/** 침엽수 하나 — 층이 셋인 실루엣. 바닥 가운데가 (x, base). */
const pine = (x: number, base: number, h: number) => {
  const w = h * 0.42;
  const tiers = [0, 0.3, 0.58].map((k) => {
    const top = base - h + h * k;
    const bottom = top + h * 0.48;
    const half = w * (0.45 + k * 0.6);
    return `M ${x} ${top} L ${x + half} ${bottom} L ${x - half} ${bottom} Z`;
  });
  const trunk = `M ${x - h * 0.03} ${base - h * 0.08} h ${h * 0.06} v ${h * 0.08} h ${-h * 0.06} Z`;
  return [...tiers, trunk].join(" ");
};

const TREES = Array.from({ length: 14 }, (_, i) => ({
  x: 8 + i * 22 + seeded(i + 900) * 10,
  h: 46 + seeded(i + 950) * 46,
}));

/** 바닥에 늘어선 침엽수 숲. 색은 레퍼런스의 회청색(#626576), 흰 숲은 tone="snow". */
export function PineRow({
  className = "",
  tone = "dusk",
}: Readonly<{ className?: string; tone?: "dusk" | "snow" }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 100"
      preserveAspectRatio="xMidYMax slice"
      className={`pointer-events-none ${className}`}
    >
      <path
        d={TREES.map((t) => pine(t.x, 100, t.h)).join(" ")}
        fill={tone === "snow" ? "#f4f2ea" : "#626576"}
      />
    </svg>
  );
}
