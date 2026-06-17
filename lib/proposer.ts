import type { Candidate, Run } from "./types";
import type { Evaluator } from "./evaluator";

/**
 * ASSAY — the PROPOSER interface.
 *
 * The proposer designs the next batch of candidates. It may read the run's
 * history (to learn from past scores) but it NEVER produces a score itself —
 * only the evaluator does that. A real Groq/LLM-backed proposer will drop in
 * here later with no changes required elsewhere.
 */
export interface Proposer {
  propose(run: Run, evaluator: Evaluator, n: number): Promise<Candidate[]>;
}

/** Build a stable candidate id like "c-3-07" (cycle 3, slot 7). */
function candidateId(cycle: number, index: number): string {
  return `c-${cycle}-${String(index).padStart(2, "0")}`;
}

const HEX_DIGITS = "0123456789abcdef";

/**
 * Tweak the hex tail of a "QD-xxxxxx" genome by flipping a few digits.
 * Small local edits → a landscape the evaluator can be climbed on.
 */
function mutateGenome(genome: string): string {
  const prefixMatch = genome.match(/^(.*?)([0-9a-fA-F]{6})$/);
  const prefix = prefixMatch ? prefixMatch[1] : "QD-";
  const hex = (prefixMatch ? prefixMatch[2] : "000000").toLowerCase().split("");

  const flips = 1 + Math.floor(Math.random() * 2); // 1–2 digits
  for (let i = 0; i < flips; i++) {
    const pos = Math.floor(Math.random() * hex.length);
    hex[pos] = HEX_DIGITS[Math.floor(Math.random() * 16)];
  }
  return `${prefix}${hex.join("")}`;
}

/**
 * Stub proposer with NO LLM.
 *  - Cycle 0 (or before any valid best exists): seed `n` random genomes.
 *  - Later cycles: mutate the best-so-far, plus a couple of pure 'explore'
 *    randoms to keep the search from collapsing onto one hill.
 */
export class StubProposer implements Proposer {
  async propose(run: Run, evaluator: Evaluator, n: number): Promise<Candidate[]> {
    const cycle = run.cycles.length; // index of the cycle we're proposing for
    const best = run.bestEver;

    // No history to learn from yet → seed a fresh random population.
    if (cycle === 0 || best === null) {
      return Array.from({ length: n }, (_, i) => ({
        id: candidateId(cycle, i),
        genome: evaluator.randomGenome(),
        generatedBy: "seed" as const,
        parentIds: [],
        cycle,
      }));
    }

    // Reserve up to 2 slots for exploration; the rest mutate the incumbent.
    const exploreCount = Math.min(2, Math.max(0, n - 1));
    const mutateCount = n - exploreCount;

    const candidates: Candidate[] = [];
    for (let i = 0; i < mutateCount; i++) {
      candidates.push({
        id: candidateId(cycle, i),
        genome: mutateGenome(best.candidate.genome),
        generatedBy: "mutate",
        parentIds: [best.candidate.id],
        cycle,
      });
    }
    for (let i = 0; i < exploreCount; i++) {
      candidates.push({
        id: candidateId(cycle, mutateCount + i),
        genome: evaluator.randomGenome(),
        generatedBy: "explore",
        parentIds: [],
        cycle,
      });
    }
    return candidates;
  }
}
