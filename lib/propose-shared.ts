/**
 * Shared request/response contract for the /api/propose route. Types only, no
 * runtime deps, so both the client proposer and the server route import it
 * without dragging code across the network boundary.
 *
 * NOTE: `datasetMeta` deliberately omits the hidden ground-truth law. The model
 * only ever sees how candidates scored and the shape of the noisy data — never
 * the answer it is meant to rediscover.
 */

export interface DatasetMeta {
  name: string;
  xRange: [number, number];
  n: number;
  noiseSigma: number;
}

/** A prior candidate that scored, summarized for the model. */
export interface HistoryEntry {
  genome: string;
  score: number;
  r2: number;
  complexity: number;
}

/** A prior candidate that failed, with the evaluator's real reason. */
export interface HistoryInvalid {
  genome: string;
  error: string;
}

export interface ProposeRequest {
  objective: string;
  datasetMeta: DatasetMeta;
  populationSize: number;
  cycle: number;
  /** How many expressions the model should return (the rest are explorers). */
  requestCount: number;
  history: {
    top: HistoryEntry[];
    invalid: HistoryInvalid[];
  };
}

export interface ProposeResponse {
  /** Parsed candidate expression strings (may be fewer than requested). */
  candidates: string[];
  /** Present when the call degraded; the proposer tops up with explorers. */
  error?: string;
  /** True when the call hit a 429 and had to back off + retry (but still succeeded or failed honestly). */
  throttled?: boolean;
}
