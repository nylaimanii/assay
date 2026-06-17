/**
 * Shared message + payload contract between the main thread and the Pyodide
 * evaluator worker. Imported by both `lib/evaluator-symbolic.ts` and
 * `workers/evaluator.worker.ts` so the two never drift. Types only — erased at
 * build time, so this file pulls no runtime code into the worker bundle.
 */

/** Result of one Python scoring call. The ONLY thing that becomes a Score. */
export type EvalPayload =
  | {
      valid: true;
      score: number;
      r2: number;
      rmse: number;
      complexity: number;
    }
  | { valid: false; error: string };

/** main → worker */
export type WorkerIn =
  | { type: "init" }
  | { type: "dataset"; requestId: string; datasetId: string; x: number[]; y: number[] }
  | { type: "evaluate"; requestId: string; genome: string; datasetId: string };

/** worker → main */
export type WorkerOut =
  | { type: "ready" }
  | { type: "init-error"; error: string }
  | { type: "dataset-ok"; requestId: string }
  | { type: "result"; requestId: string; payload: EvalPayload };
