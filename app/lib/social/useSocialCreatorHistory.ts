import { useCallback, useEffect, useState } from 'react';
import type { SocialReferenceRecord } from '@/components/social/workspace/SocialReferencesStudio';

/** Load a creator's archive, independent of the project's recent-reference preview. */
export function useSocialCreatorHistory(projectId: string, personId?: string) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    records: SocialReferenceRecord[];
    loading: boolean;
    error: string | null;
  }>({ key: '', records: [], loading: false, error: null });
  const key = `${projectId}:${personId ?? ''}`;
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!personId) return;
    let cancelled = false;
    setState({ key, records: [], loading: true, error: null });
    const load = async () => {
      const records: SocialReferenceRecord[] = [];
      const limit = 400;
      for (let offset = 0; ; offset += limit) {
        const response = await window.electron.invoke('social:references:list', { projectId, personId, limit, offset });
        if (cancelled) return;
        if (!response?.success) throw new Error(response?.error || 'Error');
        const page: SocialReferenceRecord[] = Array.isArray(response.data) ? response.data : [];
        records.push(...page);
        if (page.length < limit) break;
      }
      if (!cancelled) setState({ key, records, loading: false, error: null });
    };
    load().catch((reason: unknown) => {
      if (!cancelled) setState({ key, records: [], loading: false, error: reason instanceof Error ? reason.message : 'Error' });
    });
    const unsubscribe = window.electron?.on?.('social:explorations-updated', reload);
    return () => { cancelled = true; unsubscribe?.(); };
  }, [key, personId, projectId, revision, reload]);

  return {
    records: state.key === key ? state.records : [],
    loading: Boolean(personId) && (state.key !== key || state.loading),
    error: state.key === key ? state.error : null,
    reload,
  };
}
