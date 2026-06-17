import { create } from "zustand";
import { DEFAULT_DATASET_ID } from "@/lib/datasets";

/**
 * UI state specific to the symbolic-regression evaluator: which dataset is
 * selected and how the Python runtime warm-up is going. Kept SEPARATE from
 * useRunStore so the core loop store is untouched by this drop-in. The symbolic
 * evaluator reads `datasetId` at evaluate time and pushes `status` updates here.
 */
export type RuntimeStatus = "cold" | "warming" | "ready" | "error";

interface SymbolicState {
  datasetId: string;
  status: RuntimeStatus;
  error: string | null;
  setDataset: (id: string) => void;
  setStatus: (status: RuntimeStatus, error?: string | null) => void;
}

export const useSymbolicStore = create<SymbolicState>((set) => ({
  datasetId: DEFAULT_DATASET_ID,
  status: "cold",
  error: null,
  setDataset: (id) => set({ datasetId: id }),
  setStatus: (status, error = null) => set({ status, error }),
}));
