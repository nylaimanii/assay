/**
 * ASSAY — built-in ground-truth datasets for symbolic regression.
 *
 * Each dataset is generated from a hidden law plus Gaussian noise, DETERMINISTICALLY
 * (seeded), so a run is reproducible. The `hiddenLaw` string is for the UI only —
 * it is the thing the engine is trying to rediscover and is NEVER passed to the
 * evaluator or the proposer. Only the noisy (x, y) samples cross that boundary.
 */

export interface Dataset {
  id: string;
  name: string;
  /** Human-readable ground truth, shown in the UI. Never given to evaluator/proposer. */
  hiddenLaw: string;
  xRange: [number, number];
  n: number;
  noiseSigma: number;
  /** Deterministic sample of noisy observations. */
  generate: () => { x: number[]; y: number[] };
}

/** mulberry32 — small, fast, deterministic PRNG seeded by an integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller gaussian using a seeded uniform source. */
function gaussianSampler(rand: () => number): () => number {
  return () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/** Build a dataset whose y = law(x) + N(0, sigma), sampled on a fixed grid. */
function makeDataset(args: {
  id: string;
  name: string;
  hiddenLaw: string;
  xRange: [number, number];
  n: number;
  noiseSigma: number;
  seed: number;
  law: (x: number) => number;
}): Dataset {
  const { id, name, hiddenLaw, xRange, n, noiseSigma, seed, law } = args;
  return {
    id,
    name,
    hiddenLaw,
    xRange,
    n,
    noiseSigma,
    generate: () => {
      const rand = mulberry32(seed);
      const gauss = gaussianSampler(rand);
      const [lo, hi] = xRange;
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < n; i++) {
        const xi = lo + ((hi - lo) * i) / (n - 1);
        x.push(xi);
        y.push(law(xi) + gauss() * noiseSigma);
      }
      return { x, y };
    },
  };
}

export const DATASETS: readonly Dataset[] = [
  makeDataset({
    id: "quadratic",
    name: "Quadratic",
    hiddenLaw: "y = 2x² − 3",
    xRange: [-3, 3],
    n: 80,
    noiseSigma: 1.5,
    seed: 1337,
    law: (x) => 2 * x * x - 3,
  }),
  makeDataset({
    id: "sine",
    name: "Sine",
    hiddenLaw: "y = 2·sin(1.5x)",
    xRange: [-6, 6],
    n: 100,
    noiseSigma: 0.35,
    seed: 4242,
    law: (x) => 2 * Math.sin(1.5 * x),
  }),
  makeDataset({
    id: "inverse-square",
    name: "Inverse-square",
    hiddenLaw: "y = 6 / x²",
    xRange: [0.5, 4],
    n: 70,
    noiseSigma: 0.4,
    seed: 2718,
    law: (x) => 6 / (x * x),
  }),
];

export const DEFAULT_DATASET_ID = "quadratic";

export function getDataset(id: string): Dataset {
  const found = DATASETS.find((d) => d.id === id);
  if (!found) {
    throw new Error(`unknown dataset "${id}"`);
  }
  return found;
}
