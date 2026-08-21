import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import ListState from '@/components/shared/ListState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { HubHeader, HubPageHeader } from '@/components/hub';
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

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);

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

  // Consume a pending "focus person" intent (e.g. from the command palette) once the
  // hub mounts, and keep listening while it stays open.
  const selectPersonRefLatest = useRef(selectPersonRef.current);
  selectPersonRefLatest.current = selectPersonRef.current;
  useEffect(() => {
    const applyFocus = (personId: string) => {
      void selectPersonRefLatest.current(personId);
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
      <HubPageHeader className="shrink-0">
        <HubHeader
          title={t('people.hub_title')}
          description={t('people.hub_description')}
          actions={
            <Button type="button" size="sm" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              {t('people.new_person')}
            </Button>
          }
        />
      </HubPageHeader>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PeopleList
          people={people}
          loading={listLoading}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={(id) => void selectPerson(id)}
          checkedIds={checkedIds}
          onToggleChecked={handleToggleChecked}
          onToggleAllChecked={handleToggleAllChecked}
          onDeleteChecked={() => setPendingDeleteIds(Array.from(checkedIds))}
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
              onEnrich={() => {
                void enrichPerson(selectedPerson.id);
              }}
              onOpenPipelines={openPipelinesTab}
              onOpenCalendar={openCalendarTab}
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
                if (e.key === 'Enter') void handleCreate();
              }}
              placeholder={t('people.new_person_placeholder')}
              aria-label={t('people.new_person_placeholder')}
            />
          </AppModalBody>
          <AppModalFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              {t('people.cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!newName.trim() || createBusy}>
              {t('people.create')}
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
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={() => {
          if (!deleting) setPendingDeleteIds(null);
        }}
      />
    </div>
  );
}
