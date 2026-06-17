"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRunStore } from "@/store/useRunStore";
import { useProposerStore } from "@/store/useProposerStore";
import { formatCycleLabel, formatScore } from "@/lib/format";
import type { Cycle } from "@/lib/types";
import { CandidateRow } from "./CandidateRow";

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
            note.source === "random"
              ? "text-amber-600"
              : note.toppedUp > 0
                ? "text-amber-600"
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
  const endRef = useRef<HTMLDivElement>(null);
  const cycleCount = run?.cycles.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cycleCount]);

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

  return (
    <ScrollArea className="h-full">
      <div className="divide-y divide-border/70">
        {run.cycles.map((cycle) => (
          <div key={cycle.index} className="py-1.5">
            <CycleBlock cycle={cycle} />
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
