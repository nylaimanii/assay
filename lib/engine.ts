import type { Cycle, Evaluation, Run, RunConfig } from "./types";
import type { Evaluator } from "./evaluator";
import type { Proposer } from "./proposer";

/**
 * ASSAY — the closed-loop orchestrator.
 *
 * The loop: propose → evaluate → analyze (rank, track best) → feed back.
 * Functions here are pure-ish: they take a Run and return a NEW Run rather than
 * mutating in place, so the store can commit each cycle as it lands and the UI
 * can render the run's history progressively.
 *
 * The engine reads scores from Evaluations but never invents them — every score
 * originates in the Evaluator. The engine only compares and routes.
 */

/** Higher value wins. Invalid evaluations (value null) can never be "best". */
export function isBetter(a: Evaluation, b: Evaluation | null): boolean {
  if (a.score.value === null || !a.score.valid) return false;
  if (b === null || b.score.value === null) return true;
  return a.score.value > b.score.value;
}

/** Return whichever evaluation is better (or the existing best if neither improves). */
function bestOf(current: Evaluation | null, challenger: Evaluation | null): Evaluation | null {
  if (challenger === null) return current;
  return isBetter(challenger, current) ? challenger : current;
}

/** Pick the best valid evaluation from a batch, or null if all are invalid. */
function bestInBatch(evaluations: Evaluation[]): Evaluation | null {
  let best: Evaluation | null = null;
  for (const ev of evaluations) {
    best = bestOf(best, ev);
  }
  return best;
}

/** Create a fresh, idle run from a config. */
export function createRun(config: RunConfig): Run {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}`,
    config,
    cycles: [],
    status: "idle",
    bestEver: null,
  };
}

/**
 * Run exactly one cycle of the loop and return the updated Run.
 *
 * propose n candidates → evaluate each → assemble the Cycle with its in-cycle
 * best → append it and recompute the run-wide bestEver. Does not mutate `run`.
 */
export async function runCycle(
  run: Run,
  proposer: Proposer,
  evaluator: Evaluator,
): Promise<Run> {
  const cycleIndex = run.cycles.length;
  const n = run.config.populationSize;

  const proposed = await proposer.propose(run, evaluator, n);

  // Evaluate the batch. The evaluator is the sole source of every Score.
  const evaluated: Evaluation[] = await Promise.all(
    proposed.map(async (candidate) => {
      const score = await evaluator.evaluate(candidate.genome);
      return { candidate, score, timestampMs: Date.now() } satisfies Evaluation;
    }),
  );

  const bestSoFar = bestInBatch(evaluated);

  const cycle: Cycle = {
    index: cycleIndex,
    proposed,
    evaluated,
    bestSoFar,
  };

  const cycles = [...run.cycles, cycle];
  const bestEver = bestOf(run.bestEver, bestSoFar);
  const reachedEnd = cycles.length >= run.config.maxCycles;

  return {
    ...run,
    cycles,
    bestEver,
    status: reachedEnd ? "done" : run.status,
  };
}

/** Whether the run still has cycles left to execute. */
export function hasCyclesRemaining(run: Run): boolean {
  return run.cycles.length < run.config.maxCycles;
}

/**
 * Drive the loop, yielding the updated Run after each completed cycle so the UI
 * can render progressively. Stops when maxCycles is reached. To pause, the
 * consumer simply stops pulling from the generator (e.g. `break`s the for-await);
 * an optional `signal.paused` check lets a caller bail between cycles too.
 */
export async function* runLoop(
  initial: Run,
  proposer: Proposer,
  evaluator: Evaluator,
  signal?: { paused: () => boolean; pacingMs?: number },
): AsyncGenerator<Run, Run, void> {
  let run = initial;
  while (hasCyclesRemaining(run)) {
    if (signal?.paused()) return run;
    run = await runCycle(run, proposer, evaluator);
    yield run;
    if (signal?.pacingMs) {
      await new Promise((resolve) => setTimeout(resolve, signal.pacingMs));
    }
  }
  return run;
}
