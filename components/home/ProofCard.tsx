interface ProofCardProps {
  name: string;
  hiddenLaw: string;
  recovered: string;
  r2: string;
  xRange: [number, number];
  noiseAmp: number;
  lawFn: (x: number) => number;
  recoveredFn: (x: number) => number;
}

const W = 240;
const H = 96;
const PAD = 8;

function det(i: number): number {
  const s = Math.sin(i * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

function Sparkline({
  xRange,
  noiseAmp,
  lawFn,
  recoveredFn,
}: Pick<ProofCardProps, "xRange" | "noiseAmp" | "lawFn" | "recoveredFn">) {
  const [lo, hi] = xRange;
  const samples = Array.from({ length: 90 }, (_, i) => recoveredFn(lo + ((hi - lo) * i) / 89));
  const scatterY = Array.from({ length: 26 }, (_, i) => lawFn(lo + ((hi - lo) * i) / 25) + det(i + 3) * noiseAmp);
  const all = [...samples, ...scatterY].filter(Number.isFinite);
  const yLo = Math.min(...all);
  const yHi = Math.max(...all);
  const span = Math.max(yHi - yLo, 1e-6);

  const xPx = (x: number) => PAD + ((x - lo) / (hi - lo)) * (W - 2 * PAD);
  const yPx = (y: number) => PAD + (1 - (y - (yLo - span * 0.08)) / (span * 1.16)) * (H - 2 * PAD);

  const curve = samples
    .map((y, i) => {
      const x = lo + ((hi - lo) * i) / 89;
      return `${i === 0 ? "M" : "L"}${xPx(x).toFixed(1)},${yPx(y).toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="recovered fit over data">
      {scatterY.map((y, i) => {
        const x = lo + ((hi - lo) * i) / 25;
        return <circle key={i} cx={xPx(x)} cy={yPx(y)} r={1.7} fill="#94a3b8" fillOpacity={0.7} />;
      })}
      <path d={curve} fill="none" stroke="#4f95d6" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ProofCard(props: ProofCardProps) {
  const { name, hiddenLaw, recovered, r2 } = props;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_4px_16px_rgba(79,149,214,0.12)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{name}</span>
        <span className="rounded-full border border-[#cfe3f6] bg-signal-tint px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#2f6fb0]">
          R² {r2}
        </span>
      </div>

      <div className="rounded-lg border border-border/70 bg-background/60 p-2">
        <Sparkline {...props} />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">hidden law</span>
          <span className="font-mono text-sm tabular-nums text-slate-500">{hiddenLaw}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">ASSAY recovered</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-[#2f6fb0]">{recovered}</span>
        </div>
      </div>
    </div>
  );
}
