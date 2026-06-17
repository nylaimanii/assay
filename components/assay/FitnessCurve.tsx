import { formatValue } from "@/lib/format";

interface FitnessCurveProps {
  /** Running best-ever score at each completed cycle. */
  data: number[];
  /** Total cycles the run is configured for (sets the x extent). */
  maxCycles: number;
}

const W = 320;
const H = 150;
const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 22;

/**
 * Minimal fitness curve: thin baby-blue line over a light grid.
 * Pure/deterministic from props — no scoring logic lives here.
 */
export function FitnessCurve({ data, maxCycles }: FitnessCurveProps) {
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xCount = Math.max(maxCycles - 1, 1);
  const yMaxRaw = data.length ? Math.max(...data) : 1;
  const yMinRaw = data.length ? Math.min(...data) : 0;
  // Pad the y-domain a touch so the line never hugs the frame.
  const span = Math.max(yMaxRaw - yMinRaw, 1);
  const yMax = yMaxRaw + span * 0.12;
  const yMin = Math.max(0, yMinRaw - span * 0.12);

  const xFor = (i: number) => PAD_L + (i / xCount) * plotW;
  const yFor = (v: number) =>
    PAD_T + plotH - ((v - yMin) / Math.max(yMax - yMin, 1e-9)) * plotH;

  const linePath = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`)
    .join(" ");

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: PAD_T + plotH - t * plotH,
    value: yMin + t * (yMax - yMin),
  }));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Best-so-far fitness per cycle"
      className="block"
    >
      {/* horizontal grid + y axis ticks */}
      {gridY.map((g, i) => (
        <g key={i}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={g.y}
            y2={g.y}
            stroke="#eef2f7"
            strokeWidth={1}
          />
          <text
            x={PAD_L - 6}
            y={g.y + 3}
            textAnchor="end"
            className="fill-muted-foreground"
            style={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
          >
            {formatValue(g.value, 0)}
          </text>
        </g>
      ))}

      {/* x baseline */}
      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={PAD_T + plotH}
        y2={PAD_T + plotH}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      {/* x axis end labels */}
      <text
        x={PAD_L}
        y={H - 6}
        textAnchor="start"
        className="fill-muted-foreground"
        style={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
      >
        0
      </text>
      <text
        x={W - PAD_R}
        y={H - 6}
        textAnchor="end"
        className="fill-muted-foreground"
        style={{ fontSize: 8, fontFamily: "var(--font-geist-mono)", fontVariantNumeric: "tabular-nums" }}
      >
        {maxCycles}
      </text>

      {data.length > 0 && (
        <>
          {/* soft area under the line */}
          <path
            d={`${linePath} L${xFor(data.length - 1).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${xFor(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`}
            fill="#7fb5e6"
            fillOpacity={0.08}
          />
          {/* the curve */}
          <path
            d={linePath}
            fill="none"
            stroke="#7fb5e6"
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* leading marker */}
          <circle
            cx={xFor(data.length - 1)}
            cy={yFor(data[data.length - 1])}
            r={2.6}
            fill="#fff"
            stroke="#4f95d6"
            strokeWidth={1.4}
          />
        </>
      )}
    </svg>
  );
}
