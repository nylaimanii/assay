import { cn } from "@/lib/utils";
import type { Evaluation } from "@/lib/types";
import { formatScore, truncateGenome } from "@/lib/format";
import { ProvenanceBadge } from "./ProvenanceBadge";

/** One evaluated candidate as a row in the evolution feed. */
export function CandidateRow({
  evaluation,
  isBest,
}: {
  evaluation: Evaluation;
  isBest: boolean;
}) {
  const { candidate, score } = evaluation;
  const invalid = !score.valid || score.value === null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 border-l-2 py-1.5 pr-2 pl-2.5 text-sm transition-colors",
        isBest
          ? "border-l-signal bg-signal-tint"
          : "border-l-transparent hover:bg-muted/50",
      )}
    >
      <span className="tnum w-12 shrink-0 font-mono text-[11px] text-muted-foreground">
        {candidate.id}
      </span>
      <ProvenanceBadge kind={candidate.generatedBy} />
      <span
        className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-500"
        title={candidate.genome}
      >
        {truncateGenome(candidate.genome)}
      </span>
      {invalid ? (
        <span className="tnum shrink-0 font-mono text-[11px] font-medium text-destructive/80">
          — invalid
        </span>
      ) : (
        <span
          className={cn(
            "tnum shrink-0 font-mono text-[13px] font-semibold",
            isBest ? "text-[#2f6fb0]" : "text-foreground",
          )}
        >
          {formatScore(score)}
        </span>
      )}
    </div>
  );
}
