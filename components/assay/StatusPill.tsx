import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

const STATUS: Record<RunStatus, { label: string; dot: string; text: string; ring: string }> = {
  idle: {
    label: "idle",
    dot: "bg-slate-300",
    text: "text-slate-500",
    ring: "border-slate-200 bg-slate-50",
  },
  running: {
    label: "running",
    dot: "bg-signal animate-pulse",
    text: "text-[#2f6fb0]",
    ring: "border-[#cfe3f6] bg-signal-tint",
  },
  paused: {
    label: "paused",
    dot: "bg-amber-400",
    text: "text-amber-700",
    ring: "border-amber-200 bg-amber-50",
  },
  done: {
    label: "done",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    ring: "border-emerald-200 bg-emerald-50",
  },
};

export function StatusPill({ status }: { status: RunStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tracking-tight",
        s.ring,
        s.text,
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
