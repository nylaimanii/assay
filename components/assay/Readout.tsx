"use client";

import { useRunStore } from "@/store/useRunStore";
import { formatScore, formatValue, truncateGenome } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import { FitnessCurve } from "./FitnessCurve";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="tnum font-mono text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export function Readout() {
  const run = useRunStore((s) => s.run);
  const configuredMaxCycles = useRunStore((s) => s.maxCycles);

  const maxCycles = run?.config.maxCycles ?? configuredMaxCycles;
  const completed = run?.cycles.length ?? 0;
  const best = run?.bestEver ?? null;

  // Running best-ever fitness per completed cycle — the climbing curve.
  const data: number[] = [];
  if (run) {
    let running = -Infinity;
    for (const c of run.cycles) {
      const v = c.bestSoFar?.score.value;
      if (typeof v === "number" && v > running) running = v;
      if (running > -Infinity) data.push(running);
    }
  }

  let totalEvals = 0;
  let validEvals = 0;
  if (run) {
    for (const c of run.cycles) {
      totalEvals += c.evaluated.length;
      validEvals += c.evaluated.filter((e) => e.score.valid).length;
    }
  }
  const invalidEvals = totalEvals - validEvals;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* headline: best-ever score */}
      <section>
        <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Best-ever score
        </div>
        <div
          className={`tnum mt-1 font-mono text-4xl font-semibold tracking-tight ${
            best ? "text-[#2f6fb0]" : "text-slate-300"
          }`}
        >
          {best ? formatScore(best.score) : "—"}
        </div>
        <div className="mt-1 h-4 font-mono text-[11px] text-muted-foreground">
          {best ? (
            <span title={best.candidate.genome}>
              {truncateGenome(best.candidate.genome)} · cycle {best.candidate.cycle}
            </span>
          ) : (
            <span>awaiting first valid candidate</span>
          )}
        </div>
      </section>

      <Separator />

      {/* counters */}
      <section className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="cycle" value={`${completed} / ${maxCycles}`} />
        <Stat label="evaluations" value={String(totalEvals)} />
        <Stat label="valid" value={String(validEvals)} />
        <Stat label="invalid" value={String(invalidEvals)} />
      </section>

      <Separator />

      {/* fitness curve */}
      <section className="space-y-2">
        <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Fitness · best per cycle
        </div>
        <div className="rounded-md border border-border bg-card p-2">
          <FitnessCurve data={data} maxCycles={maxCycles} />
        </div>
      </section>

      {/* best-candidate evaluator detail — proof the judge, not the proposer, set this */}
      {best && Object.keys(best.score.detail).length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Evaluator detail
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {Object.entries(best.score.detail).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground">{k}</span>
                  <span className="tnum font-mono text-[11px] text-foreground">
                    {formatValue(v, Number.isInteger(v) ? 0 : 3)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
