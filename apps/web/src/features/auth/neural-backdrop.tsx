// 로그인 배경 — 로고(빛나는 신경망 N)의 결을 화면 전체로 넓힌다.
//
// ★ 노드 좌표를 상수로 박는다. Math.random() 으로 만들면 서버와 클라이언트가 다른
//   좌표를 그려 하이드레이션이 어긋난다.
// ★ 장식이라 스크린리더에서 숨기고(aria-hidden), 움직임 줄이기 설정이면 깜박임을 멈춘다.

const NODES: readonly [number, number][] = [
  [8, 14], [21, 6], [34, 18], [16, 31], [5, 47], [27, 42], [12, 63], [30, 72],
  [7, 86], [22, 93], [44, 88], [52, 9], [67, 15], [81, 5], [93, 19], [74, 30],
  [88, 40], [96, 58], [79, 66], [91, 82], [70, 92], [58, 80], [84, 95], [62, 24],
];

/** 가까운 노드끼리만 잇는다 — 거리 기준을 넘는 선은 화면을 거미줄로 덮는다. */
const EDGES: readonly [number, number][] = NODES.flatMap(([x1, y1], i) =>
  NODES.slice(i + 1).flatMap(([x2, y2], k): [number, number][] =>
    Math.hypot(x1 - x2, y1 - y2) < 24 ? [[i, i + 1 + k]] : [],
  ),
);

export const NeuralBackdrop = () => {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* 로고 뒤로 모이는 빛. 카드가 떠 보이게 하는 것이 이 두 겹이다. */}
      <div className="absolute top-1/2 left-1/2 size-176 -translate-x-1/2 translate-y-[-60%] rounded-full bg-primary/20 blur-[120px]" />
      <div className="absolute top-[20%] left-[62%] size-88 rounded-full bg-accent/15 blur-[100px]" />

      <svg
        className="absolute inset-0 size-full opacity-60 mask-[radial-gradient(ellipse_at_center,transparent_22%,black_75%)]"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {EDGES.map(([a, b]) => {
          const [x1, y1] = NODES[a]!;
          const [x2, y2] = NODES[b]!;
          return (
            <line
              key={`${a}-${b}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--primary)"
              strokeOpacity={0.45}
              strokeWidth={0.12}
            />
          );
        })}
        {NODES.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 0.55 : 0.35}
            fill="#a5b4fc"
            className="motion-safe:animate-pulse"
            style={{ animationDelay: `${(i * 370) % 3000}ms`, animationDuration: "3s" }}
          />
        ))}
      </svg>
    </div>
  );
};
