import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { HubMasterDetail } from '@/components/shared/HubMasterDetail';
import { HubSectionShell } from '@/components/shared/HubSectionShell';
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
import { onDomeEvent } from '@/lib/events/domeEvents';
import { useOpenIntentStore } from '@/lib/store/useOpenIntentStore';
import PeopleList from './PeopleList';
import { PersonCreateSheet } from './PersonCreateSheet';
import { PersonDetailSheet } from './PersonDetailSheet';
import PersonDetailPanel from './PersonDetailPanel';
import { BUILTIN_PERSON_STATUSES, isBuiltinPersonStatus, personStatusLabel } from './personStatuses';
import { useCustomPersonStatuses } from './useCustomPersonStatuses';
import { usePeopleHub } from './usePeopleHub';

export default function PeopleHubView() {
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  return <PeopleWorkspace key={projectId} projectId={projectId} />;
}

function PeopleWorkspace({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
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
    clearSelection,
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
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);

  const handleToggleChecked = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleToggleAllChecked = (ids: string[], checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
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

  // Keep a pending "focus person" intent until this hub actually loads them.
  // Consuming on mount races with Strict Mode remounts and nested dialogs.
  useEffect(() => {
    const applyFocus = (personId: string) => {
      selectPersonRef.current(personId).catch(() => {});
    };
    const pending = useOpenIntentStore.getState().peek('person');
    if (pending) applyFocus(pending.personId);

    return onDomeEvent('dome:focus-person', (detail) => {
      if (!detail?.personId) return;
      applyFocus(detail.personId);
    });
  }, [selectPersonRef]);

  return (
    <HubSectionShell
      title={t('people.hub_title')}
      actions={
        <Button
          type="button"
          size="sm"
          onClick={() => {
            clearSelection();
            setCreating(true);
          }}
        >
          <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
          {t('people.new_person')}
        </Button>
      }
    >
      <HubMasterDetail>
        <PeopleList
          people={people}
          loading={listLoading}
          query={query}
          onQueryChange={setQuery}
          filter={filter}
          onFilterChange={setFilter}
          selectedId={selectedId}
          onSelect={(id) => {
            setCreating(false);
            selectPerson(id).catch(() => {});
          }}
          checkedIds={checkedIds}
          onToggleChecked={handleToggleChecked}
          onToggleAllChecked={handleToggleAllChecked}
          onDeletePeople={(ids) => setPendingDeleteIds(ids)}
          onManageStatuses={() => setManagingStatuses(true)}
          onCreate={() => {
            clearSelection();
            setCreating(true);
          }}
          customs={customs}
          deleting={deleting}
        />

        <PersonDetailSheet
          open={Boolean(selectedId)}
          onClose={clearSelection}
          title={selectedPerson?.displayName || t('people.hub_title')}
          loading={detailLoading && !selectedPerson}
        >
          {selectedPerson ? (
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
                enrichPerson(selectedPerson.id).catch(() => {});
              }}
              onOpenPipelines={openPipelinesTab}
              onOpenCalendar={openCalendarTab}
              customs={customs}
              onManageStatuses={() => setManagingStatuses(true)}
            />
          ) : null}
        </PersonDetailSheet>
      </HubMasterDetail>

      <PersonCreateSheet
        open={creating}
        onOpenChange={setCreating}
        onCreate={async (input) => {
          const person = await createPerson(input);
          if (person) {
            globalThis.setTimeout(() => {
              selectPerson(person.id).catch(() => {});
            }, 0);
          }
          return person;
        }}
        customs={customs}
      />

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
        onConfirm={() => {
          confirmDelete().catch(() => {});
        }}
        onCancel={() => {
          if (!deleting) setPendingDeleteIds(null);
        }}
      />
    </HubSectionShell>
  );
}
