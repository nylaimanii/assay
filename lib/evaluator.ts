import type { Score } from "./types";

/**
 * ASSAY — the EVALUATOR interface. This is the spine of the whole project.
 *
 * CORE HONESTY PRINCIPLE: the evaluator is the ONLY thing in the system that
 * produces a Score. The proposer (and, later, the LLM) never assigns a number.
 * The judge is deterministic, sandboxed, and completely separate from whatever
 * generated the candidate. Swapping in a real Pyodide-backed evaluator later
 * must require zero changes outside this file.
 */
export interface Evaluator {
  /** Stable identifier used in RunConfig + the UI selector. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** The objective being optimized, surfaced read-only in the control panel. */
  objective: string;
  /** Score a genome. Deterministic in the genome string. Higher value = better. */
  evaluate(genome: string): Promise<Score>;
  /** Produce a fresh, valid-looking random genome for seeding/exploration. */
  randomGenome(): string;
}

/* ----------------------------------------------------------------------------
 * stub-quadratic — a placeholder evaluator with NO real domain math.
 *
 * It treats a genome as 6 hex digits decoding to an integer, and scores how
 * close that integer is to a fixed hidden target, plus a small deterministic
 * noise term. The result is a smooth-but-noisy landscape: mutating the best
 * genome tends to climb, which is exactly what we want to exercise the loop.
 * Everything here is deterministic in the genome — same genome, same score,
 * forever. The only randomness is in randomGenome(), which proposes, not judges.
 * ------------------------------------------------------------------------- */

const HEX_DIGITS = "0123456789abcdef";
const GENOME_HEX_LEN = 6;
const HEX_SPACE = 16 ** GENOME_HEX_LEN; // 16,777,216
const HIDDEN_TARGET = 0xa5f3c1; // the "law" the loop is trying to rediscover

/** FNV-1a 32-bit hash → unsigned int. Deterministic, no allocations. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619, kept in 32-bit unsigned range
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Map a 32-bit hash into [0, 1). */
function unitFromHash(h: number): number {
  return h / 0x100000000;
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class StubQuadraticEvaluator implements Evaluator {
  readonly id = "stub-quadratic";
  readonly name = "Stub · quadratic landscape";
  readonly objective =
    "Maximize closeness to a hidden target on a noisy 1-D landscape (placeholder for symbolic regression).";

  randomGenome(): string {
    let hex = "";
    for (let i = 0; i < GENOME_HEX_LEN; i++) {
      hex += HEX_DIGITS[Math.floor(Math.random() * 16)];
    }
    return `QD-${hex}`;
  }

  async evaluate(genome: string): Promise<Score> {
    const h = hashString(genome);

    // ~30ms simulated sandbox round-trip, with a touch of deterministic jitter.
    await sleep(28 + (h % 9));

    // Simulated sandbox failure path: a deterministic fraction of genomes are
    // "rejected" the way a real evaluator might fail to compile/run a candidate.
    if (h % 13 === 0) {
      return {
        value: null,
        valid: false,
        detail: {},
        error: "sandbox rejected genome (simulated compile failure)",
      };
    }

    const hex = genome.slice(-GENOME_HEX_LEN);
    const decoded = parseInt(hex, 16);
    if (!/^[0-9a-fA-F]{6}$/.test(hex) || Number.isNaN(decoded)) {
      return {
        value: null,
        valid: false,
        detail: {},
        error: `unparseable genome "${genome}"`,
      };
    }

    // Smooth component: closeness of decoded value to the hidden target, in [0, 1].
    const residual = Math.abs(decoded - HIDDEN_TARGET);
    const base = 1 - residual / HEX_SPACE;

    // Deterministic noise in roughly [-0.035, +0.035], derived from a second hash.
    const noise = (unitFromHash(hashString(`${genome}:noise`)) - 0.5) * 0.07;

    const value = round3(Math.max(0, (base + noise) * 100));

    return {
      value,
      valid: true,
      detail: {
        decoded,
        target: HIDDEN_TARGET,
        residual,
        base: round3(base * 100),
        noise: round3(noise * 100),
      },
    };
  }
}

/** The registry of available evaluators. Only the stub exists for now. */
export const EVALUATORS: readonly Evaluator[] = [new StubQuadraticEvaluator()];

export const DEFAULT_EVALUATOR_ID = "stub-quadratic";

export function getEvaluator(id: string): Evaluator {
  const found = EVALUATORS.find((e) => e.id === id);
  if (!found) {
    throw new Error(`unknown evaluator "${id}"`);
  }
  return found;
}
