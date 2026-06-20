/**
 * Hero visual anchor: a noisy scatter with a baby-blue curve that repeatedly
 * "fits" onto it (stroke draw-on loop). Pure inline SVG, deterministic, no JS —
 * a quiet nod to what the engine does. Aesthetic over literal accuracy.
 */
const W = 360;
const H = 220;
const PADX = 18;
const PADY = 18;

// Hidden law for the illustration: y = 1.6·sin(1.4x) over x ∈ [-5, 5].
const X_LO = -5;
const X_HI = 5;
const law = (x: number) => 1.6 * Math.sin(1.4 * x);

// Deterministic pseudo-noise so the render is stable across builds.
function noise(i: number): number {
  return Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5;
}

const Y_LO = -2.4;
const Y_HI = 2.4;
const xPx = (x: number) => PADX + ((x - X_LO) / (X_HI - X_LO)) * (W - 2 * PADX);
const yPx = (y: number) => PADY + (1 - (y - Y_LO) / (Y_HI - Y_LO)) * (H - 2 * PADY);

const scatter = Array.from({ length: 30 }, (_, i) => {
  const x = X_LO + ((X_HI - X_LO) * i) / 29;
  return { cx: xPx(x), cy: yPx(law(x) + noise(i + 1) * 0.9) };
});

const curve = Array.from({ length: 120 }, (_, i) => {
  const x = X_LO + ((X_HI - X_LO) * i) / 119;
  return `${i === 0 ? "M" : "L"}${xPx(x).toFixed(1)},${yPx(law(x)).toFixed(1)}`;
}).join(" ");

export function HeroFit({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label="A baby-blue curve fitting onto noisy data points"
    >
      <defs>
        <linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fb5e6" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#7fb5e6" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* faint frame */}
      <rect
        x={PADX}
        y={PADY}
        width={W - 2 * PADX}
        height={H - 2 * PADY}
        fill="none"
        stroke="#eef2f7"
        strokeWidth={1}
        rx={6}
      />
      {/* baseline */}
      <line
        x1={PADX}
        x2={W - PADX}
        y1={yPx(0)}
        y2={yPx(0)}
        stroke="#e8eef6"
        strokeWidth={1}
        strokeDasharray="3 4"
      />

      {/* soft area under the fitted curve */}
      <path d={`${curve} L${xPx(X_HI).toFixed(1)},${yPx(Y_LO)} L${xPx(X_LO).toFixed(1)},${yPx(Y_LO)} Z`} fill="url(#heroFade)" />

      {/* the data */}
      {scatter.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={2.4} fill="#94a3b8" fillOpacity={0.75} />
      ))}

      {/* the fit, drawing on in a gentle loop */}
      <path
        d={curve}
        fill="none"
        stroke="#4f95d6"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="assay-draw"
      />
    </svg>
  );
}
