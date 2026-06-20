import { Fragment } from "react";
import { Lightbulb, Sigma, Gavel, RefreshCw, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: Lightbulb, title: "Propose", label: "AI suggests a structure", n: "01" },
  { icon: Sigma, title: "Fit", label: "math solves the constants", n: "02" },
  { icon: Gavel, title: "Judge", label: "sandbox scores the fit", n: "03" },
  { icon: RefreshCw, title: "Adapt", label: "results steer the next batch", n: "04" },
] as const;

/**
 * The 4-step cycle. Horizontal on desktop, stacked on narrow screens with the
 * arrows rotating to point down. A baby-blue highlight travels the steps in
 * sequence (CSS only). The loop's return is drawn underneath.
 */
export function LoopDiagram({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {STEPS.map((step, i) => (
          <Fragment key={step.title}>
            <div
              className="assay-step group relative flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-5 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              style={{ animationDelay: `${i * 0.8}s` }}
            >
              <span className="absolute right-2.5 top-2 font-mono text-[10px] tabular-nums text-muted-foreground/50">
                {step.n}
              </span>
              <span className="assay-step-icon flex size-10 items-center justify-center rounded-lg border border-[#dcebf9] bg-signal-tint text-[#2f6fb0]">
                <step.icon className="size-5" strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold text-foreground">{step.title}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex shrink-0 items-center justify-center">
                <ArrowRight
                  className="size-4 rotate-90 text-[#9cc4ea] sm:rotate-0"
                  strokeWidth={2}
                />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* the loop closes: Adapt → Propose */}
      <div className="mt-3 flex items-center justify-center gap-2 text-center font-mono text-[11px] text-muted-foreground/70">
        <RefreshCw className="size-3 shrink-0 text-[#9cc4ea]" />
        <span>…and repeat — every cycle a little closer to the law</span>
      </div>
    </div>
  );
}
