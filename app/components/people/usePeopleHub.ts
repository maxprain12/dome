import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/lib/store/useToastStore';
import type { PeopleFilter, PersonDetail, PersonSummary } from './peopleTypes';

const SEARCH_DEBOUNCE_MS = 300;

interface UsePeopleHubOptions {
  projectId: string;
  errorLabel: string;
  saveErrorLabel: string;
  noteErrorLabel: string;
  deleteErrorLabel?: string;
  enrichErrorLabel?: string;
}

export function usePeopleHub({
  projectId,
  errorLabel,
  saveErrorLabel,
  noteErrorLabel,
  deleteErrorLabel,
  enrichErrorLabel,
}: UsePeopleHubOptions) {
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const listRequest = useRef(0);
  const selectionRequest = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current += 1;
      selectionRequest.current += 1;
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!mounted.current) return;
    const request = ++listRequest.current;
    setListLoading(true);
    try {
      const options = { projectId, leadStatus: filter === 'all' ? undefined : filter, limit: 200 };
      const res = debouncedQuery
        ? await window.electron.people.search({ ...options, query: debouncedQuery })
        : await window.electron.people.list(options);
      if (request !== listRequest.current) return;
      if (!res.success) throw new Error(res.error || errorLabel);
      setPeople(res.data?.people ?? []);
    } catch (err) {
      if (request !== listRequest.current) return;
      setPeople([]);
      showToast('error', err instanceof Error ? err.message : errorLabel);
    } finally {
      if (request === listRequest.current) setListLoading(false);
    }
  }, [projectId, filter, debouncedQuery, errorLabel]);

  useEffect(() => {
    void loadList();
    return () => { listRequest.current += 1; };
  }, [loadList]);

  const selectPerson = useCallback(async (id: string) => {
    if (!mounted.current) return;
    const request = ++selectionRequest.current;
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedPerson(null);
    setDetailLoading(true);
    try {
      const res = await window.electron.people.get({ id, includeInteractions: true });
      if (request !== selectionRequest.current) return;
      if (!res.success || !res.data?.person) throw new Error(res.error || errorLabel);
      setSelectedPerson(res.data.person);
    } catch (err) {
      if (request === selectionRequest.current) showToast('error', err instanceof Error ? err.message : errorLabel);
    } finally {
      if (request === selectionRequest.current) setDetailLoading(false);
    }
  }, [errorLabel]);

  const clearSelection = useCallback(() => {
    selectionRequest.current += 1;
    selectedIdRef.current = null;
    setSelectedId(null);
    setSelectedPerson(null);
    setDetailLoading(false);
  }, []);

  const saveProfile = useCallback(
    async (patch: {
      displayName?: string;
      notes?: string;
      leadStatus?: string;
      profile?: Record<string, unknown>;
      primaryEmail?: string;
    }): Promise<boolean> => {
      if (!selectedId) return false;
      const request = selectionRequest.current;
      setSaving(true);
      try {
        const res = await window.electron.people.updateProfile({ id: selectedId, ...patch });
        if (!res.success || !res.data?.person) {
          showToast('error', res.error || saveErrorLabel);
          return false;
        }
        if (request === selectionRequest.current) setSelectedPerson(res.data.person as PersonDetail);
        void loadList();
        return true;
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : saveErrorLabel);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [selectedId, saveErrorLabel, loadList],
  );

  const addNote = useCallback(
    async (summary: string): Promise<boolean> => {
      if (!selectedId || !summary.trim()) return false;
      const request = selectionRequest.current;
      setAddingNote(true);
      try {
        const res = await window.electron.people.addInteraction({
          personId: selectedId,
          kind: 'note',
          summary: summary.trim(),
        });
        if (!res.success) {
          showToast('error', res.error || noteErrorLabel);
          return false;
        }
        if (request === selectionRequest.current) await selectPerson(selectedId);
        return true;
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : noteErrorLabel);
        return false;
      } finally {
        setAddingNote(false);
      }
    },
    [selectedId, noteErrorLabel, selectPerson],
  );

  const createPerson = useCallback(
    async (displayName: string): Promise<PersonSummary | null> => {
      const trimmed = displayName.trim();
      if (!trimmed) return null;
      const request = selectionRequest.current;
      try {
        const res = await window.electron.people.upsert({ projectId, displayName: trimmed });
        if (!res.success || !res.data?.person) throw new Error(res.error || saveErrorLabel);
        await loadList();
        const person = res.data.person as PersonSummary;
        if (request === selectionRequest.current) await selectPerson(person.id);
        return person;
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : saveErrorLabel);
        return null;
      }
    },
    [projectId, saveErrorLabel, loadList, selectPerson],
  );

  const [deleting, setDeleting] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const enrichPerson = useCallback(
    async (personId?: string | null): Promise<boolean> => {
      const id = personId || selectedId;
      if (!id) return false;
      const request = selectionRequest.current;
      setEnriching(true);
      try {
        const res = await window.electron.people.enrich({ personId: id });
        if (!res.success || !res.data?.person) {
          showToast('error', res.error || enrichErrorLabel || errorLabel);
          return false;
        }
        if (request === selectionRequest.current && selectedIdRef.current === id) {
          setSelectedPerson(res.data.person as PersonDetail);
        }
        await loadList();
        return true;
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : enrichErrorLabel || errorLabel);
        return false;
      } finally {
        setEnriching(false);
      }
    },
    [selectedId, enrichErrorLabel, errorLabel, loadList],
  );

  const deletePeople = useCallback(
    async (ids: string[]): Promise<number> => {
      const unique = Array.from(new Set(ids.filter(Boolean)));
      if (unique.length === 0) return 0;
      setDeleting(true);
      try {
        const res = await window.electron.people.delete({ ids: unique });
        if (!res.success) {
          showToast('error', res.error || deleteErrorLabel || errorLabel);
          return 0;
        }
        const raw = res.data?.deleted;
        const count = typeof raw === 'number' ? raw : raw ? unique.length : 0;
        if (mounted.current && selectedIdRef.current && unique.includes(selectedIdRef.current)) {
          clearSelection();
        }
        await loadList();
        return count;
      } catch (err) {
        showToast('error', err instanceof Error ? err.message : deleteErrorLabel || errorLabel);
        return 0;
      } finally {
        setDeleting(false);
      }
    },
    [deleteErrorLabel, errorLabel, clearSelection, loadList],
  );

  // Keep the latest selectPerson identity around so external "focus person" intents
  // (e.g. command palette) can select once the list has loaded without re-subscribing.
  const selectPersonRef = useRef(selectPerson);
  selectPersonRef.current = selectPerson;

  return {
    people,
    listLoading,
    filter,
    setFilter,
    query,
    setQuery,
    selectedId,
    selectedPerson,
    detailLoading,
    saving,
    addingNote,
    deleting,
    enriching,
    selectPerson,
    selectPersonRef,
    clearSelection,
    saveProfile,
    addNote,
    createPerson,
    deletePeople,
    enrichPerson,
    reload: loadList,
  };
}

export type UsePeopleHubReturn = ReturnType<typeof usePeopleHub>;
