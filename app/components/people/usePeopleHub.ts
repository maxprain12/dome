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

  const loadList = useCallback(async () => {
    if (!window.electron?.people) return;
    setListLoading(true);
    try {
      if (debouncedQuery) {
        const res = await window.electron.people.search({ projectId, query: debouncedQuery, limit: 200 });
        if (!res.success) {
          showToast('error', res.error || errorLabel);
          return;
        }
        const rows = res.data?.people ?? [];
        setPeople(filter === 'all' ? rows : rows.filter((p) => p.leadStatus === filter));
        return;
      }
      const res = await window.electron.people.list({
        projectId,
        leadStatus: filter === 'all' ? undefined : filter,
        limit: 200,
      });
      if (!res.success) {
        showToast('error', res.error || errorLabel);
        return;
      }
      setPeople(res.data?.people ?? []);
    } finally {
      setListLoading(false);
    }
  }, [projectId, filter, debouncedQuery, errorLabel]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectPerson = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await window.electron.people.get({ id, includeInteractions: true });
      if (!res.success || !res.data?.person) {
        showToast('error', res.error || errorLabel);
        setSelectedPerson(null);
        return;
      }
      setSelectedPerson(res.data.person);
    } finally {
      setDetailLoading(false);
    }
  }, [errorLabel]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedPerson(null);
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
      setSaving(true);
      try {
        const res = await window.electron.people.updateProfile({ id: selectedId, ...patch });
        if (!res.success || !res.data?.person) {
          showToast('error', res.error || saveErrorLabel);
          return false;
        }
        setSelectedPerson(res.data.person as PersonDetail);
        void loadList();
        return true;
      } finally {
        setSaving(false);
      }
    },
    [selectedId, saveErrorLabel, loadList],
  );

  const addNote = useCallback(
    async (summary: string): Promise<boolean> => {
      if (!selectedId || !summary.trim()) return false;
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
        await selectPerson(selectedId);
        return true;
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
      const res = await window.electron.people.upsert({ projectId, displayName: trimmed });
      if (!res.success || !res.data?.person) {
        showToast('error', res.error || saveErrorLabel);
        return null;
      }
      await loadList();
      const person = res.data.person as PersonSummary;
      await selectPerson(person.id);
      return person;
    },
    [projectId, saveErrorLabel, loadList, selectPerson],
  );

  const [deleting, setDeleting] = useState(false);
  const [enriching, setEnriching] = useState(false);

  const enrichPerson = useCallback(
    async (personId?: string | null): Promise<boolean> => {
      const id = personId || selectedId;
      if (!id) return false;
      setEnriching(true);
      try {
        const res = await window.electron.people.enrich({ personId: id });
        if (!res.success || !res.data?.person) {
          showToast('error', res.error || enrichErrorLabel || errorLabel);
          return false;
        }
        setSelectedPerson(res.data.person as PersonDetail);
        setSelectedId(id);
        await loadList();
        return true;
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
        if (selectedId && unique.includes(selectedId)) {
          clearSelection();
        }
        await loadList();
        return count;
      } finally {
        setDeleting(false);
      }
    },
    [deleteErrorLabel, errorLabel, selectedId, clearSelection, loadList],
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
