import { create } from 'zustand';

/**
 * Zustand store for the multi-step extraction pipeline.
 *
 * Centralises the state that ExtractionView previously scattered across
 * a dozen useState calls and threaded through props. Any child component
 * can subscribe to exactly the slice it needs via
 *   `useExtractionStore(s => s.step)`
 */
const useExtractionStore = create((set) => ({
  // ── pipeline step ──────────────────────────────────────────────────────────
  step: 0,
  setStep: (s) => set({ step: s }),

  // ── file list ──────────────────────────────────────────────────────────────
  files: [],
  setFiles: (f) => set({ files: f }),
  removeFile: (idx) => set((s) => ({ files: s.files.filter((_, i) => i !== idx) })),

  // ── current file index (multi-file review) ─────────────────────────────────
  currentFileIndex: 0,
  setCurrentFileIndex: (i) => set({ currentFileIndex: i }),

  // ── extraction results per file ────────────────────────────────────────────
  fileResults: [],
  setFileResults: (r) => set({ fileResults: r }),
  updateFileResult: (idx, patch) =>
    set((s) => ({
      fileResults: s.fileResults.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    })),

  // ── file extraction statuses ───────────────────────────────────────────────
  fileStatuses: [],
  setFileStatuses: (st) => set({ fileStatuses: st }),
  updateFileStatus: (idx, status) =>
    set((s) => ({
      fileStatuses: s.fileStatuses.map((st, i) => (i === idx ? status : st)),
    })),

  // ── SME name ───────────────────────────────────────────────────────────────
  smeName: '',
  setSmeName: (n) => set({ smeName: n }),

  // ── aggregate fields after review ──────────────────────────────────────────
  aggregateFields: null,
  setAggregateFields: (f) => set({ aggregateFields: f }),

  // ── request form filters ───────────────────────────────────────────────────
  filters: {},
  setFilters: (f) => set({ filters: f }),

  // ── request form fields ────────────────────────────────────────────────────
  reqYear: '',
  setReqYear: (y) => set({ reqYear: y }),
  reqClient: '',
  setReqClient: (c) => set({ reqClient: c }),
  reqPublisher: '',
  setReqPublisher: (p) => set({ reqPublisher: p }),

  // ── saved record reference ─────────────────────────────────────────────────
  savedRecordId: null,
  setSavedRecordId: (id) => set({ savedRecordId: id }),

  // ── duplicate record reference ─────────────────────────────────────────────
  duplicateRecord: null,
  setDuplicateRecord: (r) => set({ duplicateRecord: r }),

  // ── reset the entire flow ──────────────────────────────────────────────────
  resetFlow: () =>
    set({
      step: 0,
      files: [],
      currentFileIndex: 0,
      fileResults: [],
      fileStatuses: [],
      smeName: '',
      aggregateFields: null,
      filters: {},
      savedRecordId: null,
      duplicateRecord: null,
    }),
}));

export default useExtractionStore;
