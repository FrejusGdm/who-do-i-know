"use client";

const NODES = [
  { x: 12, y: 18 }, { x: 28, y: 7 },  { x: 48, y: 12 }, { x: 68, y: 6 },
  { x: 84, y: 20 }, { x: 94, y: 42 }, { x: 88, y: 65 }, { x: 72, y: 78 },
  { x: 52, y: 85 }, { x: 32, y: 80 }, { x: 14, y: 68 }, { x: 6,  y: 44 },
  { x: 36, y: 38 }, { x: 56, y: 32 }, { x: 74, y: 48 }, { x: 22, y: 52 },
  { x: 62, y: 62 }, { x: 42, y: 22 }, { x: 18, y: 88 }, { x: 90, y: 82 },
];

const EDGES = [
  [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,11],[11,0],
  [1,17],[2,17],[17,12],[12,13],[13,14],[14,5],[12,15],[15,10],[13,16],[16,7],
  [0,15],[3,13],[4,14],[6,16],[8,18],[7,19],
];

export function HeroBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="#000"
            strokeOpacity="0.05"
            strokeWidth="0.25"
          />
        ))}
        {NODES.map((node, i) => (
          <circle
            key={i}
            cx={node.x}
            cy={node.y}
            r="0.9"
            fill="#000"
            fillOpacity="0.09"
          />
        ))}
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-[--brand-cream] via-transparent to-[--brand-cream]" />
    </div>
  );
}
