import type { Candidate, Provenance, Run } from "./types";
import type { Evaluator } from "./evaluator";
import type { Proposer } from "./proposer";
import type {
  HistoryEntry,
  HistoryInvalid,
  ProposeRequest,
  ProposeResponse,
} from "./propose-shared";
import { getDataset } from "./datasets";
import { useSymbolicStore } from "@/store/useSymbolicStore";
import { useProposerStore, type CycleNote } from "@/store/useProposerStore";

/**
 * ASSAY — REAL Groq-backed proposer. Implements the existing Proposer interface;
 * drops in behind it with no engine/type changes.
 *
 * The model reads how prior candidates scored and which failed (never the hidden
 * law), then proposes new expressions via the server route (/api/propose). It
 * NEVER scores — the evaluator remains the sole judge. A few grammar-random
 * explorers are ALWAYS blended in (not a fallback) so the search can't collapse
 * into the model's blind spots, and any shortfall is topped up honestly.
 */

const TOP_K = 6;
const INVALID_K = 3;
const SIMILARITY_THRESHOLD = 0.5;

function candidateId(cycle: number, index: number): string {
  return `c-${cycle}-${String(index).padStart(2, "0")}`;
}

/** Coarse token set of an expression, for best-effort parent attribution. */
function tokenize(expr: string): Set<string> {
  const matches = expr.toLowerCase().match(/sin|cos|exp|log|sqrt|abs|pi|x|\d+\.?\d*|\*\*|[-+*/()]/g);
  return new Set(matches ?? []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

interface ValidRecord extends HistoryEntry {
  candidateId: string;
}

/** Summarize the run's history: top-k scored genomes + a few notable invalids. */
function summarize(run: Run): {
  top: ValidRecord[];
  invalid: HistoryInvalid[];
} {
  const bestByGenome = new Map<string, ValidRecord>();
  const invalidByGenome = new Map<string, string>();

  for (const cycle of run.cycles) {
    for (const ev of cycle.evaluated) {
      const { score, candidate } = ev;
      if (score.valid && score.value !== null) {
        const rec: ValidRecord = {
          genome: candidate.genome,
          score: score.value,
          r2: score.detail.r2 ?? 0,
          complexity: score.detail.complexity ?? 0,
          candidateId: candidate.id,
        };
        const prev = bestByGenome.get(candidate.genome);
        if (!prev || rec.score > prev.score) bestByGenome.set(candidate.genome, rec);
      } else if (!score.valid) {
        invalidByGenome.set(candidate.genome, score.error ?? "invalid");
      }
    }
  }

  const top = [...bestByGenome.values()].sort((a, b) => b.score - a.score).slice(0, TOP_K);
  const invalid = [...invalidByGenome.entries()]
    .slice(-INVALID_K)
    .map(([genome, error]) => ({ genome, error }));
  return { top, invalid };
}

async function callProposeRoute(body: ProposeRequest): Promise<ProposeResponse> {
  if (typeof window === "undefined") {
    return { candidates: [], error: "no browser context" };
  }
  try {
    const res = await fetch("/api/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { candidates: [], error: `route http ${res.status}` };
    }
    return (await res.json()) as ProposeResponse;
  } catch (err) {
    return { candidates: [], error: `route unreachable: ${String(err)}` };
  }
}

export class GroqProposer implements Proposer {
  async propose(run: Run, evaluator: Evaluator, n: number): Promise<Candidate[]> {
    const cycle = run.cycles.length;
    if (cycle === 0) useProposerStore.getState().clear();

    // Always reserve a few deliberate grammar-random explorers (anti-collapse).
    const explorerBaseline = Math.min(2, Math.max(0, n - 1));
    const requestCount = Math.max(1, n - explorerBaseline);

    const datasetId = useSymbolicStore.getState().datasetId;
    const dataset = getDataset(datasetId);
    const { top, invalid } = summarize(run);

    const response = await callProposeRoute({
      objective: run.config.objective,
      datasetMeta: {
        name: dataset.name,
        xRange: dataset.xRange,
        n: dataset.n,
        noiseSigma: dataset.noiseSigma,
      },
      populationSize: n,
      cycle,
      requestCount,
      history: {
        top: top.map(({ genome, score, r2, complexity }) => ({ genome, score, r2, complexity })),
        invalid,
      },
    });

    const groqGenomes = response.candidates.slice(0, requestCount);
    const groqCount = groqGenomes.length;
    const shortfall = requestCount - groqCount; // explorers that cover a Groq miss
    const explorerCount = explorerBaseline + shortfall;

    const tokenizedTop = top.map((t) => ({ rec: t, tokens: tokenize(t.genome) }));
    const isSeedCycle = cycle === 0;

    const candidates: Candidate[] = [];
    let slot = 0;

    for (const genome of groqGenomes) {
      let generatedBy: Provenance = isSeedCycle ? "seed" : "explore";
      let parentIds: string[] = [];

      if (!isSeedCycle && tokenizedTop.length > 0) {
        const cand = tokenize(genome);
        let bestSim = 0;
        let bestParent: string | null = null;
        for (const { rec, tokens } of tokenizedTop) {
          const sim = jaccard(cand, tokens);
          if (sim > bestSim) {
            bestSim = sim;
            bestParent = rec.candidateId;
          }
        }
        if (bestSim >= SIMILARITY_THRESHOLD && bestParent) {
          generatedBy = "mutate";
          parentIds = [bestParent];
        }
      }

      candidates.push({
        id: candidateId(cycle, slot++),
        genome,
        generatedBy,
        parentIds,
        cycle,
      });
    }

    for (let i = 0; i < explorerCount; i++) {
      candidates.push({
        id: candidateId(cycle, slot++),
        genome: evaluator.randomGenome(),
        generatedBy: isSeedCycle ? "seed" : "explore",
        parentIds: [],
        cycle,
      });
    }

    // Record an honest provenance note for this cycle.
    const note = buildNote({
      groqCount,
      explorerCount,
      shortfall,
      requestCount,
      error: response.error,
    });
    useProposerStore.getState().setNote(cycle, note);

    return candidates;
  }
}

function buildNote(args: {
  groqCount: number;
  explorerCount: number;
  shortfall: number;
  requestCount: number;
  error?: string;
}): CycleNote {
  const { groqCount, explorerCount, shortfall, requestCount, error } = args;

  if (groqCount === 0) {
    return {
      source: "random",
      groqCount: 0,
      explorerCount,
      toppedUp: shortfall,
      message: `groq unavailable — exploring randomly${error ? ` (${error})` : ""}`,
    };
  }
  if (shortfall > 0) {
    return {
      source: "mixed",
      groqCount,
      explorerCount,
      toppedUp: shortfall,
      message: `groq returned ${groqCount}/${requestCount} — topped up ${shortfall} with explorers`,
    };
  }
  return { source: "mixed", groqCount, explorerCount, toppedUp: 0 };
}
