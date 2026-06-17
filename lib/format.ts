import type { Score } from "./types";

/** Render a score's value honestly: fixed-precision when valid, em-dash when not. */
export function formatScore(score: Score, digits = 3): string {
  if (!score.valid || score.value === null) return "—";
  return score.value.toFixed(digits);
}

/** Render a raw numeric value (already known valid) to fixed precision. */
export function formatValue(value: number | null, digits = 3): string {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

/** Zero-pad a cycle index for the "CYCLE 03" label. */
export function formatCycleLabel(index: number): string {
  return String(index).padStart(2, "0");
}

/** Truncate a genome for inline display, keeping head and tail. */
export function truncateGenome(genome: string, max = 22): string {
  if (genome.length <= max) return genome;
  const head = genome.slice(0, max - 4);
  return `${head}…${genome.slice(-3)}`;
}
