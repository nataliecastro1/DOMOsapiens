import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRecords,
  updateRecord as apiUpdateRecord,
  deleteRecord as apiDeleteRecord,
} from '../services/api';

/**
 * React Query hook for ROI records.
 *
 * Replaces the manual `load()` + `useState([])` + `useEffect` pattern used in
 * TrackerView's TabROIData, TabExports, and TabBulkImport. All three tabs now
 * share one cached query, so navigating between them is instant.
 *
 * Mutations automatically invalidate the cache so the table re-renders with
 * fresh data after edits or deletes.
 */
export function useRecords() {
  return useQuery({
    queryKey: ['records'],
    queryFn: getRecords,
    select: (d) => (Array.isArray(d) ? d : []),
  });
}

/**
 * Mutation for PATCH /records/:id — inline edits in the Tracker.
 * Automatically refetches the records list on success.
 */
export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, changes, user, note }) =>
      apiUpdateRecord(recordId, { changes, user, note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['records'] }),
  });
}

/**
 * Mutation for DELETE /records/:id.
 * Optimistically removes the row from the cache for a snappy UX, and
 * refetches in the background to reconcile.
 */
export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, reason }) => apiDeleteRecord(recordId, reason),
    onMutate: async ({ recordId }) => {
      await qc.cancelQueries({ queryKey: ['records'] });
      const prev = qc.getQueryData(['records']);
      qc.setQueryData(['records'], (old) =>
        (old || []).filter((r) => r.record_id !== recordId)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['records'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['records'] }),
  });
}
