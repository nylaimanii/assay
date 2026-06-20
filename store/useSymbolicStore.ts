import { create } from "zustand";
import { DEFAULT_DATASET_ID } from "@/lib/datasets";

/**
 * UI state specific to the symbolic-regression evaluator: which dataset is
 * selected and how the Python runtime warm-up is going. Kept SEPARATE from
 * useRunStore so the core loop store is untouched by this drop-in. The symbolic
 * evaluator reads `datasetId` at evaluate time and pushes `status` updates here.
 */
export type RuntimeStatus = "cold" | "warming" | "ready" | "error";

/** A mid-run target swap: from this cycle index on, the new dataset is the judge. */
export interface SwapMarker {
  cycle: number;
  datasetId: string;
}

interface SymbolicState {
  datasetId: string;
  status: RuntimeStatus;
  error: string | null;
  /** Recorded target swaps in the current run (for feed markers + curve annotations). */
  swaps: SwapMarker[];
  /** Cycle index from which the CURRENT target is in effect (0, or the last swap). */
  lastSwapCycle: number;
  setDataset: (id: string) => void;
  setStatus: (status: RuntimeStatus, error?: string | null) => void;
  recordSwap: (cycle: number, datasetId: string) => void;
  clearSwaps: () => void;
}

export const useSymbolicStore = create<SymbolicState>((set) => ({
  datasetId: DEFAULT_DATASET_ID,
  status: "cold",
  error: null,
  swaps: [],
  lastSwapCycle: 0,
  setDataset: (id) => set({ datasetId: id }),
  setStatus: (status, error = null) => set({ status, error }),
  recordSwap: (cycle, datasetId) =>
    set((s) => ({ swaps: [...s.swaps, { cycle, datasetId }], lastSwapCycle: cycle })),
  clearSwaps: () => set({ swaps: [], lastSwapCycle: 0 }),
}));
