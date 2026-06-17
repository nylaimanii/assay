import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/types";

/** Restrained, distinct tints per provenance — technical, not candy-colored. */
const STYLES: Record<Provenance, { label: string; className: string }> = {
  seed: {
    label: "seed",
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
  mutate: {
    label: "mutate",
    className: "bg-signal-tint text-[#2f6fb0] border-[#cfe3f6]",
  },
  crossover: {
    label: "crossover",
    className: "bg-indigo-50 text-indigo-600 border-indigo-100",
  },
  explore: {
    label: "explore",
    className: "bg-amber-50 text-amber-700 border-amber-100",
  },
};

export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  const { label, className } = STYLES[kind];
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-md px-1.5 font-mono text-[10px] font-medium tracking-tight tabular-nums",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
