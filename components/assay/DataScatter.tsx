import { useMemo } from "react";
import { compileExpression } from "@/lib/expr";

interface DataScatterProps {
  points: { x: number[]; y: number[] };
  xRange: [number, number];
  /** Best-ever candidate genome to overlay as a predicted curve (display only). */
  genome: string | null;
}

const W = 320;
const H = 180;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 20;

/**
 * Scatter the noisy dataset (muted slate dots) and overlay the best-ever
 * candidate's predicted curve (baby-blue line). The curve is drawn with a
 * display-only compiler — never a score. As best-ever improves, the line snaps
 * toward the data.
 */
export function DataScatter({ points, xRange, genome }: DataScatterProps) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const [xLo, xHi] = xRange;

  const { yLo, yHi } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of points.y) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { yLo: 0, yHi: 1 };
    const span = Math.max(hi - lo, 1e-6);
    return { yLo: lo - span * 0.1, yHi: hi + span * 0.1 };
  }, [points.y]);

  const xFor = (v: number) => PAD_L + ((v - xLo) / Math.max(xHi - xLo, 1e-9)) * plotW;
  const yFor = (v: number) => PAD_T + plotH - ((v - yLo) / Math.max(yHi - yLo, 1e-9)) * plotH;
  const clampY = (py: number) => Math.min(PAD_T + plotH, Math.max(PAD_T, py));

  const curvePath = useMemo(() => {
    if (!genome) return null;
    const fn = compileExpression(genome);
    if (!fn) return null;
    const SAMPLES = 160;
    let d = "";
    let penDown = false;
    for (let i = 0; i < SAMPLES; i++) {
      const xv = xLo + ((xHi - xLo) * i) / (SAMPLES - 1);
      const yv = fn(xv);
      if (!Number.isFinite(yv)) {
        penDown = false; // lift pen across singularities / NaNs
        continue;
      }
      const px = xFor(xv).toFixed(1);
      const py = clampY(yFor(yv)).toFixed(1);
      d += `${penDown ? "L" : "M"}${px},${py} `;
      penDown = true;
    }
    return d.trim() || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genome, xLo, xHi, yLo, yHi]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Dataset samples with best-ever predicted curve"
      className="block"
    >
      {/* frame */}
      <rect
        x={PAD_L}
        y={PAD_T}
        width={plotW}
        height={plotH}
        fill="none"
        stroke="#eef2f7"
        strokeWidth={1}
      />

      {/* dataset points */}
      {points.x.map((xv, i) => (
        <circle
          key={i}
          cx={xFor(xv)}
          cy={clampY(yFor(points.y[i]))}
          r={1.7}
          fill="#94a3b8"
          fillOpacity={0.7}
        />
      ))}

      {/* best-ever predicted curve */}
      {curvePath && (
        <path
          d={curvePath}
          fill="none"
          stroke="#4f95d6"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}

      {/* x axis labels */}
      <text
        x={PAD_L}
        y={H - 5}
        textAnchor="start"
        className="fill-muted-foreground"
        style={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
      >
        {xLo}
      </text>
      <text
        x={W - PAD_R}
        y={H - 5}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
      >
        {xHi}
      </text>
    </svg>
  );
}
