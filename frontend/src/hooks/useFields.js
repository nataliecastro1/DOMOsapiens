import { useQuery } from '@tanstack/react-query';
import { getFields } from '../services/api';
import { useMemo } from 'react';

/**
 * React Query hook for the field catalog.
 *
 * Replaces the hand-rolled useFields() in TrackerView that used a module-level
 * _fieldsCache + useState + useEffect. React Query handles caching, deduping,
 * and background refetches automatically.
 *
 * staleTime: Infinity — the catalog changes only on redeployment, so one fetch
 * per browser session is enough.
 */
export default function useFields() {
  const { data: catalog = [], isLoading: loading } = useQuery({
    queryKey: ['fields'],
    queryFn: getFields,
    staleTime: Infinity,
    select: (d) => (Array.isArray(d) ? d : []),
  });

  return useMemo(() => ({
    catalog,
    loading,
    columns:     catalog.filter(f => f.ui_visible),
    colByKey:    Object.fromEntries(catalog.map(f => [f.key, f])),
    provMetrics: catalog.filter(f => f.provenance).map(f => [f.key, f.label]),
  }), [catalog, loading]);
}
