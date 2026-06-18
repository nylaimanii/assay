import type { Score } from "./types";
import type { Evaluator } from "./evaluator";
import type { EvalPayload, WorkerIn, WorkerOut } from "./worker-protocol";
import { getDataset } from "./datasets";
import { useSymbolicStore } from "@/store/useSymbolicStore";

/**
 * ASSAY — REAL symbolic-regression evaluator. Implements the existing Evaluator
 * interface with zero changes to its shape; it drops in behind the registry.
 *
 * Scoring runs in a Pyodide web worker (Python + numpy), loaded once and cached.
 * This module only manages the worker, queues calls, and maps the worker's verdict
 * onto a Score. It never computes a score itself, and never sees the hidden law.
 */

// Generous enough that the FIRST nonlinear candidate can lazily download scipy
// (a one-time few-second load) without being killed; linear evals finish in ~30ms.
const EVAL_TIMEOUT_MS = 15000;

/* --- worker singleton + request plumbing (browser only) ------------------- */

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((err: Error) => void) | null = null;

let reqCounter = 0;
const resolvers = new Map<string, (msg: WorkerOut) => void>();
const loadedDatasets = new Set<string>();
const datasetInFlight = new Map<string, Promise<void>>();

function nextRequestId(prefix: string): string {
  reqCounter += 1;
  return `${prefix}-${reqCounter}`;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/evaluator.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent<WorkerOut>) => {
    const msg = e.data;
    if (msg.type === "ready") {
      useSymbolicStore.getState().setStatus("ready");
      readyResolve?.();
      return;
    }
    if (msg.type === "init-error") {
      useSymbolicStore.getState().setStatus("error", msg.error);
      readyReject?.(new Error(msg.error));
      readyPromise = null; // allow a later retry
      return;
    }
    // dataset-ok and result are matched back to their awaiting caller by id
    const resolve = resolvers.get(msg.requestId);
    if (resolve) {
      resolvers.delete(msg.requestId);
      resolve(msg);
    }
  };
  worker.onerror = (event) => {
    const message = event.message || "worker crashed";
    useSymbolicStore.getState().setStatus("error", message);
    readyReject?.(new Error(message));
    readyPromise = null;
  };
  return worker;
}

/** Ensure Pyodide is loaded and ready. Idempotent; safe to call repeatedly. */
export function warmUpSymbolic(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (readyPromise) return readyPromise;

  const w = getWorker();
  useSymbolicStore.getState().setStatus("warming");
  readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  post(w, { type: "init" });
  return readyPromise;
}

function post(w: Worker, msg: WorkerIn): void {
  w.postMessage(msg);
}

/** Register a dataset's samples in the worker exactly once. */
function ensureDatasetLoaded(datasetId: string): Promise<void> {
  if (loadedDatasets.has(datasetId)) return Promise.resolve();
  const existing = datasetInFlight.get(datasetId);
  if (existing) return existing;

  const w = getWorker();
  const requestId = nextRequestId("ds");
  const { x, y } = getDataset(datasetId).generate();

  const promise = new Promise<void>((resolve) => {
    resolvers.set(requestId, () => {
      loadedDatasets.add(datasetId);
      datasetInFlight.delete(datasetId);
      resolve();
    });
    post(w, { type: "dataset", requestId, datasetId, x, y });
  });
  datasetInFlight.set(datasetId, promise);
  return promise;
}

const TIMEOUT = Symbol("timeout");

function postEvaluate(genome: string, datasetId: string): Promise<EvalPayload> {
  const w = getWorker();
  const requestId = nextRequestId("ev");
  return new Promise<EvalPayload>((resolve) => {
    resolvers.set(requestId, (msg) => {
      if (msg.type === "result") resolve(msg.payload);
      else resolve({ valid: false, error: "unexpected worker reply" });
    });
    post(w, { type: "evaluate", requestId, genome, datasetId });
  });
}

function invalid(error: string): Score {
  return { value: null, valid: false, detail: {}, error };
}

/* --- expression grammar for random proposals ------------------------------ */

/**
 * Explorers propose STRUCTURE with named free parameters (C0, C1, …), never
 * baked-in numbers — the evaluator fits the constants by least-squares. Each
 * form is a linear combination of basis functions of x, so it is linear in its
 * parameters and fittable in one shot (matching this pass's scope).
 */
const BASES = ["1", "x", "x**2", "x**3", "1/x", "1/x**2", "sin(x)", "cos(x)", "exp(x)", "sqrt(x)"];

// Nonlinear-in-parameter forms (a Cn inside a function) — fit by scipy (pass B).
const NONLINEAR_FORMS = [
  "C0*sin(C1*x + C2)",
  "C0*cos(C1*x + C2)",
  "C0*sin(C1*x)",
  "C0*exp(C1*x)",
  "C0*exp(C1*x) + C2",
];

function randomParamForm(): string {
  // Sometimes explore a nonlinear form (periodic / exponential laws)...
  if (Math.random() < 0.35) {
    return NONLINEAR_FORMS[Math.floor(Math.random() * NONLINEAR_FORMS.length)];
  }
  // ...otherwise a linear combination of basis functions (linear in its params).
  const pool = [...BASES];
  const k = 1 + Math.floor(Math.random() * 3);
  const chosen: string[] = [];
  for (let i = 0; i < k && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen
    .map((basis, i) => (basis === "1" ? `C${i}` : `C${i}*${basis}`))
    .join(" + ");
}

/* --- the Evaluator ------------------------------------------------------- */

export class SymbolicRegressionEvaluator implements Evaluator {
  readonly id = "symbolic-regression";
  readonly name = "Symbolic regression · Pyodide";
  readonly objective =
    "Rediscover the law behind noisy data: fit an expression in x, rewarded for accuracy (R²) and parsimony (low complexity).";

  /** Serialize evaluate calls so concurrent cycles never race the single worker. */
  private chain: Promise<unknown> = Promise.resolve();

  randomGenome(): string {
    return randomParamForm();
  }

  evaluate(genome: string): Promise<Score> {
    const run = () => this.doEvaluate(genome);
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async doEvaluate(genome: string): Promise<Score> {
    if (typeof window === "undefined") {
      return invalid("symbolic evaluator unavailable on the server");
    }
    try {
      await warmUpSymbolic();
    } catch (err) {
      return invalid(`python runtime failed to load: ${String(err)}`);
    }

    const datasetId = useSymbolicStore.getState().datasetId;
    try {
      await ensureDatasetLoaded(datasetId);
    } catch (err) {
      return invalid(`failed to load dataset: ${String(err)}`);
    }

    const timeout = new Promise<typeof TIMEOUT>((resolve) =>
      setTimeout(() => resolve(TIMEOUT), EVAL_TIMEOUT_MS),
    );
    const payload = await Promise.race([postEvaluate(genome, datasetId), timeout]);

    if (payload === TIMEOUT) {
      return invalid(`evaluation timed out after ${EVAL_TIMEOUT_MS}ms`);
    }
    if (!payload.valid) {
      return invalid(payload.error);
    }
    return {
      value: payload.score,
      valid: true,
      detail: {
        score: payload.score,
        r2: payload.r2,
        rmse: payload.rmse,
        complexity: payload.complexity,
        ...(payload.params ?? {}), // fitted constants, e.g. { C0: 5.98 }
      },
      fittedExpr: payload.fittedExpr,
    };
  }
}
