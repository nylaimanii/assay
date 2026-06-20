"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRunStore } from "@/store/useRunStore";
import { useProposerStore } from "@/store/useProposerStore";
import { useSymbolicStore } from "@/store/useSymbolicStore";
import { getDataset } from "@/lib/datasets";
import { formatCycleLabel, formatScore } from "@/lib/format";
import type { Cycle } from "@/lib/types";
import { CandidateRow } from "./CandidateRow";

/** Inline marker showing where the live target was swapped. */
function SwapMarker({ datasetId, cycle }: { datasetId: string; cycle: number }) {
  let name = datasetId;
  try {
    name = getDataset(datasetId).name;
  } catch {
    /* unknown id — show the raw id */
  }
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <span className="h-px flex-1 bg-[#cfe3f6]" />
      <span className="rounded-full border border-[#cfe3f6] bg-signal-tint px-2 py-0.5 font-mono text-[10px] font-medium text-[#2f6fb0]">
        ⇄ target swapped → {name} @ cycle {cycle}
      </span>
      <span className="h-px flex-1 bg-[#cfe3f6]" />
    </div>
  );
}

function CycleBlock({ cycle }: { cycle: Cycle }) {
  const bestId = cycle.bestSoFar?.candidate.id ?? null;
  const validCount = cycle.evaluated.filter((e) => e.score.valid).length;
  const note = useProposerStore((s) => s.notes[cycle.index]);

  return (
    <div className="animate-cycle-in">
      <div className="flex items-center justify-between px-2.5 py-1.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-wide text-foreground">
            CYCLE {formatCycleLabel(cycle.index)}
          </span>
          <span className="tnum font-mono text-[10px] text-muted-foreground">
            {validCount}/{cycle.evaluated.length} valid
          </span>
        </div>
        {cycle.bestSoFar ? (
          <span className="tnum font-mono text-[11px] text-muted-foreground">
            best{" "}
            <span className="font-semibold text-[#2f6fb0]">
              {formatScore(cycle.bestSoFar.score)}
            </span>
          </span>
        ) : (
          <span className="font-mono text-[11px] text-destructive/70">all invalid</span>
        )}
      </div>
      {note && (
        <p
          className={`px-2.5 pb-1 font-mono text-[10px] ${
            note.source === "random" || note.toppedUp > 0
              ? "text-amber-600"
              : note.throttled
                ? "text-[#5a8bc0]"
                : "text-muted-foreground/70"
          }`}
        >
          {note.message ?? `groq ×${note.groqCount} · explorers ×${note.explorerCount}`}
        </p>
      )}
      <div className="space-y-px">
        {cycle.evaluated.map((ev) => (
          <CandidateRow
            key={ev.candidate.id}
            evaluation={ev}
            isBest={ev.candidate.id === bestId}
          />
        ))}
      </div>
    </div>
  );
}

export function EvolutionFeed() {
  const run = useRunStore((s) => s.run);
  const swaps = useSymbolicStore((s) => s.swaps);
  const endRef = useRef<HTMLDivElement>(null);
  const cycleCount = run?.cycles.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cycleCount, swaps.length]);

  if (!run || run.cycles.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="font-mono text-sm text-muted-foreground">no cycles yet</p>
        <p className="max-w-[28ch] text-xs text-muted-foreground/70">
          press Start to seed a population and run the propose · evaluate · analyze loop.
        </p>
      </div>
    );
  }

  const swapByCycle = new Map(swaps.map((s) => [s.cycle, s.datasetId]));

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border/70">
        {run.cycles.map((cycle) => (
          <div key={cycle.index} className="py-1.5">
            {swapByCycle.has(cycle.index) && (
              <SwapMarker datasetId={swapByCycle.get(cycle.index)!} cycle={cycle.index} />
            )}
            <CycleBlock cycle={cycle} />
          </div>
        ))}
        {/* a pending swap recorded at a not-yet-run cycle index */}
        {swaps
          .filter((s) => s.cycle >= run.cycles.length)
          .map((s) => (
            <SwapMarker key={`pending-${s.cycle}`} datasetId={s.datasetId} cycle={s.cycle} />
          ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
