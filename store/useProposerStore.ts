import { create } from "zustand";

/**
 * Per-cycle provenance notes from the proposer, kept SEPARATE from the core run
 * store (the Cycle type is frozen). The Groq proposer records how each cycle's
 * batch was composed — how many came from the LLM, how many were grammar-random
 * explorers, whether Groq was unavailable or partially failed and got topped up.
 * The feed surfaces these so a degraded cycle is never silently hidden.
 */
export type ProposerSource = "groq" | "mixed" | "random";

export interface CycleNote {
  source: ProposerSource;
  groqCount: number;
  explorerCount: number;
  /** Explorers added to cover a Groq shortfall (≠ the deliberate baseline explorers). */
  toppedUp: number;
  /** True when the propose call hit a 429 and recovered via backoff + retry. */
  throttled?: boolean;
  /** Set only when something noteworthy happened (unavailable / partial / throttled). */
  message?: string;
}

interface ProposerState {
  notes: Record<number, CycleNote>;
  setNote: (cycle: number, note: CycleNote) => void;
  clear: () => void;
}

export const useProposerStore = create<ProposerState>((set) => ({
  notes: {},
  setNote: (cycle, note) =>
    set((state) => ({ notes: { ...state.notes, [cycle]: note } })),
  clear: () => set({ notes: {} }),
}));
