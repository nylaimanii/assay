import { create } from "zustand";
import type { Run, RunConfig } from "@/lib/types";
import {
  DEFAULT_EVALUATOR_ID,
  getEvaluator,
} from "@/lib/evaluator";
import type { Proposer } from "@/lib/proposer";
import { StubProposer } from "@/lib/proposer";
import { GroqProposer } from "@/lib/proposer-groq";
import {
  createRun,
  hasCyclesRemaining,
  runCycle,
  runLoop,
} from "@/lib/engine";

/**
 * Choose the proposer for a run. The construction site — not engine.ts — decides
 * which Proposer drops into the unchanged runCycle loop: the symbolic-regression
 * evaluator pairs with the Groq proposer; everything else uses the stub.
 */
function makeProposer(evaluatorId: string): Proposer {
  return evaluatorId === "symbolic-regression"
    ? new GroqProposer()
    : new StubProposer();
}

/** Default seed parameters per the spec. */
const DEFAULT_POPULATION = 8;
const DEFAULT_MAX_CYCLES = 20;

/** Wall-clock breathing room between committed cycles so the feed is watchable. */
const PACING_MS = 150;

/**
 * Monotonic token used to cancel an in-flight loop. Pause/reset/start all bump
 * it; any loop iteration that sees a stale token stops committing. Kept outside
 * React/zustand state because it is control-flow plumbing, not rendered data.
 */
let activeToken = 0;

interface RunState {
  run: Run | null;
  isRunning: boolean;
  selectedEvaluatorId: string;
  populationSize: number;
  maxCycles: number;

  /** Update editable parameters (applied to the NEXT run started). */
  configure: (patch: Partial<Pick<RunState, "populationSize" | "maxCycles" | "selectedEvaluatorId">>) => void;
  /** Start a fresh run from the current parameters and drive it to completion. */
  start: () => void;
  /** Stop the loop between cycles; the run can be resumed. */
  pause: () => void;
  /** Continue a paused run from where it stopped. */
  resume: () => void;
  /** Discard the current run; parameters are kept. */
  reset: () => void;
  /** Execute exactly one cycle, then stop (paused). */
  stepOnce: () => Promise<void>;
}

function buildConfig(state: RunState): RunConfig {
  const evaluator = getEvaluator(state.selectedEvaluatorId);
  return {
    objective: evaluator.objective,
    populationSize: state.populationSize,
    maxCycles: state.maxCycles,
    evaluatorId: state.selectedEvaluatorId,
  };
}

export const useRunStore = create<RunState>((set, get) => {
  /** Drive the loop from the current run, committing each cycle as it lands. */
  async function drive(): Promise<void> {
    const startRun = get().run;
    if (!startRun) return;

    const myToken = ++activeToken;
    const proposer = makeProposer(startRun.config.evaluatorId);
    const evaluator = getEvaluator(startRun.config.evaluatorId);

    set({ isRunning: true, run: { ...startRun, status: "running" } });

    const loop = runLoop(get().run as Run, proposer, evaluator, {
      paused: () => activeToken !== myToken,
      pacingMs: PACING_MS,
    });

    for await (const updated of loop) {
      if (activeToken !== myToken) return; // cancelled by pause/reset/new start
      set({ run: updated });
    }

    // Loop ended naturally (reached maxCycles). runCycle already marked it done.
    if (activeToken === myToken) {
      set({ isRunning: false });
    }
  }

  return {
    run: null,
    isRunning: false,
    selectedEvaluatorId: DEFAULT_EVALUATOR_ID,
    populationSize: DEFAULT_POPULATION,
    maxCycles: DEFAULT_MAX_CYCLES,

    configure: (patch) => {
      // Configuration only affects runs not yet started.
      if (get().isRunning) return;
      set(patch);
    },

    start: () => {
      activeToken++; // invalidate anything in flight
      const run = createRun(buildConfig(get()));
      set({ run });
      void drive();
    },

    pause: () => {
      activeToken++; // stale-out the running loop
      set((state) => ({
        isRunning: false,
        run: state.run ? { ...state.run, status: "paused" } : null,
      }));
    },

    resume: () => {
      const run = get().run;
      if (!run || get().isRunning) return;
      if (!hasCyclesRemaining(run)) return;
      void drive();
    },

    reset: () => {
      activeToken++;
      set({ run: null, isRunning: false });
    },

    stepOnce: async () => {
      if (get().isRunning) return;
      const myToken = ++activeToken;

      let run = get().run;
      if (!run) {
        run = createRun(buildConfig(get()));
      }
      if (!hasCyclesRemaining(run)) return;

      set({ isRunning: true, run: { ...run, status: "running" } });

      const proposer = makeProposer(run.config.evaluatorId);
      const evaluator = getEvaluator(run.config.evaluatorId);
      const updated = await runCycle(run, proposer, evaluator);

      if (activeToken !== myToken) return; // superseded mid-step

      const status = hasCyclesRemaining(updated) ? "paused" : "done";
      set({ run: { ...updated, status }, isRunning: false });
    },
  };
});
