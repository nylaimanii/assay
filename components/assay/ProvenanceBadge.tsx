import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/types";

/** Restrained, distinct tints per provenance — technical, not candy-colored. */
const STYLES: Record<Provenance, { label: string; className: string; title: string }> = {
  seed: {
    label: "seed",
    className: "bg-slate-100 text-slate-600 border-slate-200",
    title: "initial seed expression",
  },
  mutate: {
    label: "mutate",
    className: "bg-signal-tint text-[#2f6fb0] border-[#cfe3f6]",
    title: "refined from a prior candidate it was shown",
  },
  crossover: {
    label: "crossover",
    className: "bg-indigo-50 text-indigo-600 border-indigo-100",
    title: "recombined from parent candidates",
  },
  explore: {
    label: "explore",
    className: "bg-amber-50 text-amber-700 border-amber-100",
    title: "grammar-random explorer (anti-collapse)",
  },
};

export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  const { label, className, title } = STYLES[kind];
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "h-5 rounded-md px-1.5 font-mono text-[10px] font-medium tracking-tight tabular-nums",
        className,
      )}
    >
      {label}
    </Badge>
  );
}
