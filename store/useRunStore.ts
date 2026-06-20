import { create } from "zustand";
import type { Evaluation, Run, RunConfig } from "@/lib/types";
import {
  DEFAULT_EVALUATOR_ID,
  getEvaluator,
} from "@/lib/evaluator";
import type { Proposer } from "@/lib/proposer";
import { StubProposer } from "@/lib/proposer";
import { GroqProposer } from "@/lib/proposer-groq";
import { createRun, hasCyclesRemaining, isBetter, runCycle } from "@/lib/engine";
import { useSymbolicStore } from "@/store/useSymbolicStore";

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

/** Whether a cycle is mid-flight right now (so a swap can skip the transitional one). */
let cycleInFlight = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Best-ever evaluation honestly re-baselined to the CURRENT target: only cycles
 * at or after `minCycle` (the last target swap) count, because earlier cycles
 * were scored on different data. Never carries a stale best across a swap.
 */
function bestEverFrom(run: Run, minCycle: number): Evaluation | null {
  let best: Evaluation | null = null;
  for (const c of run.cycles) {
    if (c.index < minCycle) continue;
    if (c.bestSoFar && isBetter(c.bestSoFar, best)) best = c.bestSoFar;
  }
  return best;
}

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
  /** Swap the active target dataset mid-run; the loop keeps running on new data. */
  swapDataset: (datasetId: string) => void;
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
  /**
   * Drive the loop manually, re-reading the latest run from the store before each
   * cycle. This is what makes a live target swap work: swapDataset mutates the
   * store (new dataset + re-baselined best), and the very next cycle picks it up —
   * engine.runCycle's signature and logic stay untouched.
   */
  async function drive(): Promise<void> {
    if (!get().run) return;
    const myToken = ++activeToken;
    set((s) => ({ isRunning: true, run: s.run ? { ...s.run, status: "running" } : null }));

    const config = get().run!.config;
    const proposer = makeProposer(config.evaluatorId);
    const evaluator = getEvaluator(config.evaluatorId);

    while (activeToken === myToken) {
      const current = get().run;
      if (!current || current.cycles.length >= current.config.maxCycles) break;

      cycleInFlight = true;
      let updated: Run;
      try {
        updated = await runCycle(current, proposer, evaluator);
      } finally {
        cycleInFlight = false;
      }
      if (activeToken !== myToken) return; // cancelled by pause/reset/new start

      // Authoritative best-ever: only cycles on the CURRENT target (post last swap).
      const minCycle = useSymbolicStore.getState().lastSwapCycle;
      set({ run: { ...updated, bestEver: bestEverFrom(updated, minCycle) } });

      await sleep(PACING_MS);
      if (activeToken !== myToken) return;
    }

    if (activeToken === myToken) set({ isRunning: false });
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
      useSymbolicStore.getState().clearSwaps(); // fresh run → no swap history
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
      useSymbolicStore.getState().clearSwaps();
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

      const minCycle = useSymbolicStore.getState().lastSwapCycle;
      const status = hasCyclesRemaining(updated) ? "paused" : "done";
      set({ run: { ...updated, status, bestEver: bestEverFrom(updated, minCycle) }, isRunning: false });
    },

    swapDataset: (datasetId) => {
      const symbolic = useSymbolicStore.getState();
      const run = get().run;

      // Not in a run yet → just select the dataset for the next run.
      if (!run) {
        symbolic.setDataset(datasetId);
        return;
      }
      if (datasetId === symbolic.datasetId) return;

      // A cycle in flight was proposed/scored on the OLD target — treat it as
      // pre-swap so it can never pollute the new target's best or history.
      const swapCycle = run.cycles.length + (cycleInFlight ? 1 : 0);

      symbolic.setDataset(datasetId); // evaluator scores on new data; UI shows it
      symbolic.recordSwap(swapCycle, datasetId);

      // Re-baseline honestly: drop the stale best (measured on the old data).
      // The next cycle on the new target re-establishes it from real scores.
      set({ run: { ...run, bestEver: null } });
    },
  };
});
