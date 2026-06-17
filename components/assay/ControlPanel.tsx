"use client";

import { useEffect } from "react";
import { Play, Pause, StepForward, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { EVALUATORS, getEvaluator } from "@/lib/evaluator";
import { warmUpSymbolic } from "@/lib/evaluator-symbolic";
import { DATASETS } from "@/lib/datasets";
import { useRunStore } from "@/store/useRunStore";
import { useSymbolicStore } from "@/store/useSymbolicStore";

const SYMBOLIC_ID = "symbolic-regression";

function ParamSlider({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="tnum font-mono text-sm font-medium text-foreground">{value}</span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={1}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
      />
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground/70">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function PickerButton({
  title,
  subtitle,
  selected,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-60",
        selected ? "border-[#cfe3f6] bg-signal-tint" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className="space-y-0.5">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block font-mono text-[10px] text-muted-foreground">{subtitle}</span>
      </span>
      <span className={cn("size-2 rounded-full", selected ? "bg-signal" : "bg-slate-200")} />
    </button>
  );
}

export function ControlPanel() {
  const run = useRunStore((s) => s.run);
  const isRunning = useRunStore((s) => s.isRunning);
  const populationSize = useRunStore((s) => s.populationSize);
  const maxCycles = useRunStore((s) => s.maxCycles);
  const selectedEvaluatorId = useRunStore((s) => s.selectedEvaluatorId);
  const configure = useRunStore((s) => s.configure);
  const start = useRunStore((s) => s.start);
  const pause = useRunStore((s) => s.pause);
  const resume = useRunStore((s) => s.resume);
  const reset = useRunStore((s) => s.reset);
  const stepOnce = useRunStore((s) => s.stepOnce);

  const datasetId = useSymbolicStore((s) => s.datasetId);
  const runtimeStatus = useSymbolicStore((s) => s.status);
  const runtimeError = useSymbolicStore((s) => s.error);
  const setDataset = useSymbolicStore((s) => s.setDataset);

  const evaluator = getEvaluator(selectedEvaluatorId);
  const isSymbolic = selectedEvaluatorId === SYMBOLIC_ID;
  const symbolicReady = runtimeStatus === "ready";
  const symbolicBlocked = isSymbolic && !symbolicReady;

  const status = run?.status ?? "idle";
  const isPaused = status === "paused";
  const hasRemaining = run ? run.cycles.length < run.config.maxCycles : true;
  const canStep = !isRunning && hasRemaining && !symbolicBlocked;

  // Begin loading the Python runtime as soon as the symbolic evaluator is chosen.
  useEffect(() => {
    if (isSymbolic) void warmUpSymbolic();
  }, [isSymbolic]);

  return (
    <div className="flex h-full flex-col gap-5">
      {/* objective — read-only, from the evaluator */}
      <section className="space-y-1.5">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Objective
        </h2>
        <p className="text-sm leading-snug text-foreground">{evaluator.objective}</p>
      </section>

      <Separator />

      {/* evaluator selector */}
      <section className="space-y-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Evaluator
        </h2>
        <div className="space-y-1.5">
          {EVALUATORS.map((e) => (
            <PickerButton
              key={e.id}
              title={e.name}
              subtitle={e.id}
              selected={e.id === selectedEvaluatorId}
              disabled={isRunning}
              onClick={() => configure({ selectedEvaluatorId: e.id })}
            />
          ))}
        </div>
      </section>

      {/* dataset picker — only for symbolic regression */}
      {isSymbolic && (
        <>
          <Separator />
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Dataset
            </h2>
            <div className="space-y-1.5">
              {DATASETS.map((d) => (
                <PickerButton
                  key={d.id}
                  title={d.name}
                  subtitle={d.hiddenLaw}
                  selected={d.id === datasetId}
                  disabled={isRunning}
                  onClick={() => setDataset(d.id)}
                />
              ))}
            </div>
            <RuntimeStatusLine status={runtimeStatus} error={runtimeError} />
          </section>
        </>
      )}

      <Separator />

      {/* parameters */}
      <section className="space-y-4">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Parameters
        </h2>
        <ParamSlider
          label="population size"
          value={populationSize}
          min={2}
          max={32}
          disabled={isRunning}
          onChange={(v) => configure({ populationSize: v })}
        />
        <ParamSlider
          label="max cycles"
          value={maxCycles}
          min={4}
          max={60}
          disabled={isRunning}
          onChange={(v) => configure({ maxCycles: v })}
        />
      </section>

      <Separator />

      {/* transport controls */}
      <section className="mt-auto space-y-2">
        <Button
          className="w-full"
          disabled={isRunning || !hasRemaining || symbolicBlocked}
          onClick={() => (isPaused ? resume() : start())}
        >
          {symbolicBlocked && runtimeStatus === "warming" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {isPaused ? "Resume" : "Start"}
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" disabled={!isRunning} onClick={pause}>
            <Pause className="size-4" />
            Pause
          </Button>
          <Button variant="outline" disabled={!canStep} onClick={() => void stepOnce()}>
            <StepForward className="size-4" />
            Step
          </Button>
          <Button variant="ghost" disabled={!run} onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </div>
      </section>
    </div>
  );
}

function RuntimeStatusLine({
  status,
  error,
}: {
  status: "cold" | "warming" | "ready" | "error";
  error: string | null;
}) {
  if (status === "warming" || status === "cold") {
    return (
      <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        warming up python runtime…
      </p>
    );
  }
  if (status === "ready") {
    return (
      <p className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-600">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        python runtime ready
      </p>
    );
  }
  return (
    <p className="font-mono text-[11px] text-destructive">
      runtime error: {error ?? "failed to load"}
    </p>
  );
}
