import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import ListState from '@/components/shared/ListState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import PeopleList from './PeopleList';
import PersonDetailPanel from './PersonDetailPanel';
import { BUILTIN_PERSON_STATUSES, isBuiltinPersonStatus, personStatusLabel } from './personStatuses';
import { useCustomPersonStatuses } from './useCustomPersonStatuses';
import { usePeopleHub } from './usePeopleHub';

export default function PeopleHubView() {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const { openPipelinesTab, openCalendarTab } = useTabStore();

  const {
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
    saveProfile,
    addNote,
    createPerson,
    deletePeople,
    enrichPerson,
  } = usePeopleHub({
    projectId,
    errorLabel: t('people.load_error'),
    saveErrorLabel: t('people.save_error'),
    noteErrorLabel: t('people.add_note_error'),
    deleteErrorLabel: t('people.delete_error'),
    enrichErrorLabel: t('people.enrich_error'),
  });

  const { customs, add: addStatus, remove: removeStatus } = useCustomPersonStatuses();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const handleCreate = async () => {
    setCreateBusy(true);
    try {
      const person = await createPerson(newName);
      if (person) {
        setCreating(false);
        setNewName('');
      }
    } finally {
      setCreateBusy(false);
    }
  };

  const handleToggleChecked = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggleAllChecked = (checked: boolean) => {
    if (!checked) {
      setCheckedIds(new Set());
      return;
    }
    setCheckedIds(new Set(people.map((p) => p.id)));
  };

  const confirmDelete = async () => {
    if (!pendingDeleteIds?.length) return;
    const count = await deletePeople(pendingDeleteIds);
    if (count > 0) {
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const id of pendingDeleteIds) next.delete(id);
        return next;
      });
    }
    setPendingDeleteIds(null);
  };

  useEffect(() => {
    if (filter !== 'all' && !isBuiltinPersonStatus(filter) && !customs.some((row) => row.id === filter)) {
      setFilter('all');
    }
  }, [customs, filter, setFilter]);

  const handleAddStatus = async () => {
    setStatusBusy(true);
    try {
      const created = await addStatus(statusDraft);
      if (created) setStatusDraft('');
    } finally {
      setStatusBusy(false);
    }
  };

  // Consume a pending "focus person" intent (e.g. from the command palette) once the
  // hub mounts, and keep listening while it stays open.
  const selectPersonRefLatest = useRef(selectPersonRef.current);
  selectPersonRefLatest.current = selectPersonRef.current;
  useEffect(() => {
    const applyFocus = (personId: string) => { selectPersonRefLatest.current(personId);
    };
    const pending = useOpenIntentStore.getState().consume('person');
    if (pending) applyFocus(pending.personId);

    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ personId?: string }>).detail;
      if (!detail?.personId) return;
      useOpenIntentStore.getState().consume('person');
      applyFocus(detail.personId);
    };
    window.addEventListener('dome:focus-person', onFocus);
    return () => window.removeEventListener('dome:focus-person', onFocus);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PeopleList
          people={people}
          loading={listLoading}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={(id) => selectPerson(id)}
          checkedIds={checkedIds}
          onToggleChecked={handleToggleChecked}
          onToggleAllChecked={handleToggleAllChecked}
          onDeleteChecked={() => setPendingDeleteIds(Array.from(checkedIds))}
          onCreate={() => setCreating(true)}
          onManageStatuses={() => setManagingStatuses(true)}
          customs={customs}
          deleting={deleting}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {selectedId && detailLoading ? (
            <ListState variant="loading" loadingLabel={t('people.loading')} fullHeight />
          ) : selectedPerson ? (
            <PersonDetailPanel
              key={selectedPerson.id}
              person={selectedPerson}
              saving={saving}
              addingNote={addingNote}
              deleting={deleting}
              enriching={enriching}
              onSave={saveProfile}
              onAddNote={addNote}
              onDelete={() => setPendingDeleteIds([selectedPerson.id])}
              onEnrich={() => { enrichPerson(selectedPerson.id);
              }}
              onOpenPipelines={openPipelinesTab}
              onOpenCalendar={openCalendarTab}
              customs={customs}
              onManageStatuses={() => setManagingStatuses(true)}
            />
          ) : (
            <ListState
              variant="empty"
              icon={<HugeiconsIcon icon={UserMultiple02Icon} className="size-8" />}
              title={t('people.detail_empty_title')}
              description={t('people.detail_empty_description')}
              fullHeight
            />
          )}
        </div>
      </div>

      <AppModal open={creating} onOpenChange={setCreating}>
        <AppModalContent size="sm">
          <AppModalHeader title={t('people.new_person_title')} />
          <AppModalBody>
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the field the user just opened
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate().catch(() => {});
                }
              }}
              placeholder={t('people.new_person_placeholder')}
              aria-label={t('people.new_person_placeholder')}
            />
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t('people.cancel')}
            </Button>
            <Button onClick={() => handleCreate()} disabled={!newName.trim() || createBusy}>
              {t('people.create')}
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>

      <AppModal open={managingStatuses} onOpenChange={setManagingStatuses}>
        <AppModalContent size="sm">
          <AppModalHeader title={t('people.manage_statuses_title')} />
          <AppModalBody>
            <div className="flex flex-col gap-3">
              <Input
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddStatus().catch(() => {});
                  }
                }}
                placeholder={t('people.add_status_placeholder')}
                aria-label={t('people.add_status_placeholder')}
              />
              <div className="flex flex-wrap gap-1">
                {BUILTIN_PERSON_STATUSES.map((id) => (
                  <span
                    key={id}
                    className="rounded-md border px-2 py-0.5 text-[0.6875rem] text-muted-foreground"
                  >
                    {personStatusLabel(id, t)}
                  </span>
                ))}
              </div>
              {customs.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {customs.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
                      <span className="truncate text-xs font-medium">{row.label}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('people.remove_status', { name: row.label })}
                        onClick={() => {
                          removeStatus(row.id).catch(() => {});
                        }}
                      >
                        <HugeiconsIcon icon={Delete02Icon} />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">{t('people.custom_statuses_empty')}</p>
              )}
            </div>
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setManagingStatuses(false)}>
              {t('people.cancel')}
            </Button>
            <Button
              onClick={() => {
                handleAddStatus().catch(() => {});
              }}
              disabled={!statusDraft.trim() || statusBusy}
            >
              {t('people.add_status')}
            </Button>
          </AppModalFooter>
        </AppModalContent>
      </AppModal>

      <ConfirmDialog
        isOpen={pendingDeleteIds != null && pendingDeleteIds.length > 0}
        title={
          (pendingDeleteIds?.length ?? 0) > 1
            ? t('people.delete_many_title', { count: pendingDeleteIds?.length ?? 0 })
            : t('people.delete_title')
        }
        message={
          (pendingDeleteIds?.length ?? 0) > 1
            ? t('people.delete_many_message', { count: pendingDeleteIds?.length ?? 0 })
            : t('people.delete_message')
        }
        confirmLabel={t('people.delete')}
        cancelLabel={t('people.cancel')}
        variant="danger"
        busy={deleting}
        onConfirm={() => { confirmDelete();
        }}
        onCancel={() => {
          if (!deleting) setPendingDeleteIds(null);
        }}
      />
    </div>
  );
}
