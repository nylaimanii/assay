"use client";

import { useMemo } from "react";
import { useRunStore } from "@/store/useRunStore";
import { useSymbolicStore } from "@/store/useSymbolicStore";
import { getDataset } from "@/lib/datasets";
import { formatScore, formatValue, truncateGenome } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import { FitnessCurve } from "./FitnessCurve";
import { DataScatter } from "./DataScatter";

const SYMBOLIC_ID = "symbolic-regression";

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
  const selectedEvaluatorId = useRunStore((s) => s.selectedEvaluatorId);
  const datasetId = useSymbolicStore((s) => s.datasetId);

  const isSymbolic = selectedEvaluatorId === SYMBOLIC_ID;
  const dataset = isSymbolic ? getDataset(datasetId) : null;
  const points = useMemo(
    () => (dataset ? dataset.generate() : null),
    [dataset],
  );

  const maxCycles = run?.config.maxCycles ?? configuredMaxCycles;
  const completed = run?.cycles.length ?? 0;
  const best = run?.bestEver ?? null;
  // Prefer the fitted expression (real numeric constants) for display + overlay;
  // the structural genome (with C0, C1, …) doesn't plot on its own.
  const bestExpr = best?.score.fittedExpr ?? best?.candidate.genome ?? null;

  // Running best fitness per cycle, RESET at each target swap so the curve dips
  // and re-climbs — earlier cycles were scored on different data.
  const swaps = useSymbolicStore((s) => s.swaps);
  const swapSet = new Set(swaps.map((s) => s.cycle));
  const data: number[] = [];
  if (run) {
    let running = -Infinity;
    for (const c of run.cycles) {
      if (swapSet.has(c.index)) running = -Infinity; // new segment
      const v = c.bestSoFar?.score.value;
      if (typeof v === "number" && (running === -Infinity || v > running)) running = v;
      data.push(running === -Infinity ? 0 : running);
    }
  }
  const swapMarks = swaps.map((s) => s.cycle).filter((c) => c < (run?.cycles.length ?? 0));

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
        <div className="mt-1 h-4 truncate font-mono text-[11px] text-muted-foreground">
          {best ? (
            <span title={bestExpr ?? best.candidate.genome}>
              {truncateGenome(bestExpr ?? best.candidate.genome, 28)} · cycle {best.candidate.cycle}
            </span>
          ) : (
            <span>awaiting first valid candidate</span>
          )}
        </div>
      </section>

      {/* symbolic regression: hidden target + data/fit scatter */}
      {isSymbolic && dataset && points && (
        <>
          <Separator />
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Target
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/70">
                hidden from the engine
              </span>
            </div>
            <div className="tnum rounded-md border border-dashed border-[#cfe3f6] bg-signal-tint px-3 py-1.5 text-center font-mono text-sm font-medium text-[#2f6fb0]">
              {dataset.hiddenLaw}
            </div>
            <div className="rounded-md border border-border bg-card p-2">
              <DataScatter points={points} xRange={dataset.xRange} genome={bestExpr} />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground/70">
              <span className="text-slate-400">●</span> noisy data ·{" "}
              <span className="text-[#4f95d6]">—</span> best-ever fit
            </p>
          </section>
        </>
      )}

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
          <FitnessCurve data={data} maxCycles={maxCycles} swaps={swapMarks} />
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
