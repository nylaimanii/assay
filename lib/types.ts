/**
 * ASSAY — core domain types.
 *
 * The closed loop is: design (Proposer) → make/test (Evaluator) → analyze (Engine).
 * Convention: HIGHER score = BETTER.
 *
 * A candidate that failed or is invalid has `value: null` and `valid: false`.
 * It must NEVER be rendered or treated as a score of 0 — invalid is its own state.
 */

/** How a candidate came to exist. Drives the badge + lineage in the feed. */
export type Provenance = "seed" | "mutate" | "crossover" | "explore";

/** A single proposed solution. The genome is an opaque string the evaluator understands. */
export interface Candidate {
  /** Stable unique id, e.g. "c-3-07" (cycle 3, index 7). */
  id: string;
  /** Opaque, evaluator-specific encoding of the candidate. */
  genome: string;
  /** How the proposer produced this candidate. */
  generatedBy: Provenance;
  /** Ids of the candidates this one derived from (empty for seeds/explores). */
  parentIds: string[];
  /** The cycle index in which this candidate was proposed. */
  cycle: number;
}

/**
 * The verdict from the deterministic evaluator — the ONLY source of scores.
 *
 * `value`  numeric fitness (higher is better) when valid; null when invalid.
 * `valid`  whether the genome scored at all. false ⇒ value is null.
 * `detail` named sub-metrics the evaluator chose to expose (all numeric).
 * `error`  human-readable reason when valid is false.
 */
export interface Score {
  value: number | null;
  valid: boolean;
  detail: Record<string, number>;
  error?: string;
  /**
   * Optional, back-compatible: the candidate expression with its free constants
   * fitted in (e.g. "5.98 / x ** 2"). Present when the evaluator fit parameters;
   * the proposer and UI read it to show the rediscovered law, but it is never a
   * source of score — only the evaluator's `value` is.
   */
  fittedExpr?: string;
}

/** A candidate paired with the score the evaluator gave it. */
export interface Evaluation {
  candidate: Candidate;
  score: Score;
  /** When the evaluation completed (epoch ms). */
  timestampMs: number;
}

/** One full turn of the loop: a batch proposed, evaluated, and ranked. */
export interface Cycle {
  index: number;
  proposed: Candidate[];
  evaluated: Evaluation[];
  /** Best valid evaluation produced within THIS cycle (null if all invalid). */
  bestSoFar: Evaluation | null;
}

/** Parameters that define a run. Objective is read from the active evaluator. */
export interface RunConfig {
  objective: string;
  populationSize: number;
  maxCycles: number;
  evaluatorId: string;
}

export type RunStatus = "idle" | "running" | "paused" | "done";

/** A full discovery run: configuration plus the accumulating history of cycles. */
export interface Run {
  id: string;
  config: RunConfig;
  cycles: Cycle[];
  status: RunStatus;
  /** Best valid evaluation across the entire run (null until one exists). */
  bestEver: Evaluation | null;
}
