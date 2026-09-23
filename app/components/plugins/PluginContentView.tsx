import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { FileEditIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/PageHeader';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import ListState from '@/components/shared/ListState';
import { SafeText } from '@/components/shared/SafeText';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import PluginEntryEditor, { type PluginEntryEditorHandle } from '@/components/plugins/PluginEntryEditor';
import PluginTemplateField from '@/components/plugins/PluginTemplateField';
import { requestPlugin } from '@/lib/plugins/request';
import { pluginSelectOptionLabel, slugifyPluginTitle } from '@/lib/plugins/fields';
import type {
  DomePluginInfo,
  PluginFieldValues,
  PluginHostContext,
  PluginNote,
  PluginNoteStatus,
  PluginVaultTemplate,
} from '@/types/plugin';

type EntryFilter = 'all' | 'draft' | 'published';

function emptyFields(template: PluginVaultTemplate): PluginFieldValues {
  const values: PluginFieldValues = {};
  for (const field of template.fields) {
    if (field.type === 'tags') values[field.id] = [];
    else if (field.type === 'select') values[field.id] = field.options?.[0] || '';
    else if (field.type === 'date') values[field.id] = new Date().toISOString().slice(0, 10);
    else values[field.id] = '';
  }
  return values;
}

function fieldText(fields: PluginFieldValues, id: string): string {
  const value = fields[id];
  return Array.isArray(value) ? value.join(', ') : value || '';
}

function actionError(cause: unknown, conflict: string, localMedia: string, fallback: string): string {
  const message = cause instanceof Error ? cause.message : '';
  if (message.startsWith('CONFLICT:')) return conflict;
  if (message === 'LOCAL_MEDIA_FORBIDDEN') return localMedia;
  return message || fallback;
}

function matchesFilter(note: PluginNote, filter: EntryFilter): boolean {
  if (filter === 'published') return note.status === 'published';
  if (filter === 'draft') return note.status !== 'published';
  return true;
}

export default function PluginContentView({ plugin }: { plugin: DomePluginInfo }) {
  const { t, i18n } = useTranslation();
  const template = plugin.contributes?.vaultTemplate;
  const [context, setContext] = useState<PluginHostContext | null>(null);
  const [notes, setNotes] = useState<PluginNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [values, setValues] = useState<PluginFieldValues>({});
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const entryRef = useRef<PluginEntryEditorHandle>(null);
  const [entryDirty, setEntryDirty] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryFilter>('all');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [publishingMany, setPublishingMany] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<{
    id: string;
    repo: string;
    branch: string;
    files: string[];
    entryCount: number;
  } | null>(null);
  const [confirmingPublish, setConfirmingPublish] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [nextContext, nextNotes] = await Promise.all([
        requestPlugin<PluginHostContext>(plugin.id, 'host.context'),
        requestPlugin<PluginNote[]>(plugin.id, 'notes.list', { limit: 200 }),
      ]);
      setContext(nextContext);
      setNotes(nextNotes);
    } catch (cause) {
      setError(actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.load_error')));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [plugin.id, t]);

  useEffect(() => {
    void load(false).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (dialogOpen) titleRef.current?.focus();
  }, [dialogOpen]);

  const replaceNote = (note: PluginNote) => {
    setNotes((current) => current.map((item) => item.id === note.id ? note : item));
  };

  const upsertNotes = (items: PluginNote[]) => {
    setNotes((current) => {
      const next = new Map(current.map((item) => [item.id, item]));
      for (const item of items) next.set(item.id, item);
      return [...next.values()].sort((left, right) => right.updatedAt - left.updatedAt);
    });
  };

  const leaveEntry = async () => {
    if (!entryRef.current?.isDirty()) return true;
    return Boolean(await entryRef.current.save());
  };

  const selectEntry = async (id: string | null) => {
    if (navigating || id === selectedId) return;
    setNavigating(true);
    try {
      if (await leaveEntry()) { setEntryDirty(false); setSelectedId(id); }
    } finally { setNavigating(false); }
  };

  const openCreate = async () => {
    if (!(await leaveEntry())) return;
    if (!template) return;
    setTitle('');
    setValues(emptyFields(template));
    setCreateError(null);
    setDialogOpen(true);
  };

  const updateField = (id: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [id]: value }));
  };

  const updateTitle = (nextTitle: string) => {
    setTitle(nextTitle);
    if (!template?.fields.some((field) => field.id === 'slug')) return;
    setValues((current) => current.slug === slugifyPluginTitle(title) || !current.slug
      ? { ...current, slug: slugifyPluginTitle(nextTitle) }
      : current);
  };

  const createNote = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !template) return;
    setCreating(true);
    setCreateError(null);
    try {
      const note = await requestPlugin<PluginNote>(plugin.id, 'notes.create', {
        title: trimmed,
        body: '',
        fields: values,
      });
      setDialogOpen(false);
      setSelectedId(note.id);
      setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
      await load(true);
    } catch (cause) {
      setCreateError(actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.create_error')));
    } finally {
      setCreating(false);
    }
  };

  const publish = async (note: PluginNote) => {
    setPublishingId(note.id);
    setNotice(null);
    try {
      const proposal = await requestPlugin<{ id: string; repo: string; branch: string; files?: string[]; path?: string }>(
        plugin.id,
        'publication.prepare',
        { resourceId: note.id },
      );
      setPendingPublish({
        id: proposal.id,
        repo: proposal.repo,
        branch: proposal.branch,
        files: proposal.files?.length ? proposal.files : [proposal.path || ''].filter(Boolean),
        entryCount: 1,
      });
    } catch (cause) {
      setNotice({ text: actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.load_error')), error: true });
    } finally {
      setPublishingId(null);
    }
  };

  const publishMany = async () => {
    if (!(await leaveEntry())) return;
    const ids = checkedIds.filter((id) => notes.some((note) => note.id === id));
    if (ids.length === 0) return;
    setPublishingMany(true);
    setNotice(null);
    try {
      const proposal = await requestPlugin<{ id: string; repo: string; branch: string; files?: string[]; path?: string }>(
        plugin.id,
        'publication.prepareMany',
        { resourceIds: ids },
      );
      setPendingPublish({
        id: proposal.id,
        repo: proposal.repo,
        branch: proposal.branch,
        files: proposal.files?.length ? proposal.files : (proposal.path || '').split('\n').filter(Boolean),
        entryCount: ids.length,
      });
    } catch (cause) {
      setNotice({ text: actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.load_error')), error: true });
    } finally {
      setPublishingMany(false);
    }
  };

  const confirmPublish = async () => {
    if (!pendingPublish) return;
    const pending = pendingPublish;
    setConfirmingPublish(true);
    setNotice(null);
    try {
      const result = await requestPlugin<{ status: string; path?: string; paths?: string[] }>(
        plugin.id,
        'publication.requestApproval',
        { id: pending.id },
      );
      if (result.status === 'published') {
        setNotice({
          text: pending.entryCount > 1
            ? t('plugins.published_many', { count: result.paths?.length || pending.entryCount })
            : t('plugins.published_path', { path: result.path || '' }),
          error: false,
        });
        if (pending.entryCount > 1) setCheckedIds([]);
      } else {
        setNotice({ text: t('plugins.publication_cancelled'), error: false });
      }
      setPendingPublish(null);
      await load(true);
    } catch (cause) {
      setNotice({ text: actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.load_error')), error: true });
    } finally {
      setConfirmingPublish(false);
    }
  };

  const dismissPublish = () => {
    if (confirmingPublish || !pendingPublish) return;
    const id = pendingPublish.id;
    setPendingPublish(null);
    void requestPlugin(plugin.id, 'publication.cancel', { id }).catch(() => {});
  };

  const syncRemote = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const result = await requestPlugin<{ imported: number; images: number; truncated: boolean; notes: PluginNote[] }>(
        plugin.id,
        'notes.sync',
      );
      if (result.notes?.length) upsertNotes(result.notes);
      const count = result.imported || 0;
      const images = result.images || 0;
      if (result.truncated) {
        setNotice({ text: t('plugins.sync_truncated', { count, images }), error: false });
      } else if (count > 0 || images > 0) {
        setNotice({ text: t('plugins.sync_imported', { count, images }), error: false });
      } else {
        setNotice({ text: t('plugins.sync_none'), error: false });
      }
      setSyncOpen(false);
      await load(true);
    } catch (cause) {
      setNotice({ text: actionError(cause, t('plugins.conflict'), t('plugins.local_media_forbidden'), t('plugins.sync_error')), error: true });
      setSyncOpen(false);
    } finally {
      setSyncing(false);
    }
  };

  const toggleChecked = (id: string, on: boolean) => {
    setCheckedIds((current) => (
      on ? [...current.filter((item) => item !== id), id] : current.filter((item) => item !== id)
    ));
  };
  const heading = plugin.contributes?.view?.title || plugin.name;
  const description = context
    ? context.destination?.repo
      ? t('plugins.workspace_repo', { vault: context.vault.name, repo: context.destination.repo })
      : t('plugins.workspace_no_repo', { vault: context.vault.name })
    : undefined;
  const requiredFields = useMemo(
    () => (template?.fields || []).filter((field) => field.required),
    [template],
  );
  const search = query.trim().toLocaleLowerCase(i18n.language);
  const visibleNotes = notes.filter((note) => matchesFilter(note, filter) && (!search || [note.title, ...Object.values(note.fields).flat()].join(' ').toLocaleLowerCase(i18n.language).includes(search)));
  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const draftCount = notes.filter((note) => note.status !== 'published').length;
  const publishedCount = notes.filter((note) => note.status === 'published').length;

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ListState variant="error" errorMessage={t('plugins.unavailable')} fullHeight />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-4 sm:px-6">
        <PageHeader
          className="flex-col sm:flex-row"
          title={heading}
          description={description}
          actions={
            <>
              <Button type="button" variant="outline" disabled={syncing || entryDirty || navigating || !context?.destination?.repo} onClick={() => setSyncOpen(true)}>
                {syncing ? t('plugins.syncing') : t('plugins.sync')}
              </Button>
              <Button type="button" variant="outline" disabled={entryDirty || navigating} onClick={() => { void load(true); }}>
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                {t('common.refresh')}
              </Button>
              {checkedIds.length > 0 ? (
                <Button type="button" disabled={publishingMany} onClick={() => { void publishMany().catch(() => {}); }}>
                  {publishingMany
                    ? t('plugins.publishing_selected')
                    : t('plugins.publish_selected', { count: checkedIds.length })}
                </Button>
              ) : null}
              <Button type="button" disabled={navigating} onClick={() => { void openCreate(); }}>{t('plugins.new_entry')}</Button>
            </>
          }
        />
        <ToggleGroup value={[filter]} onValueChange={(value) => { if (value[0]) setFilter(value[0] as EntryFilter); }} size="sm" aria-label={t('plugins.entry_filter')}>
          <ToggleGroupItem value="all">{t('plugins.metric_entries')} <span className="tabular-nums text-muted-foreground">{notes.length}</span></ToggleGroupItem>
          <ToggleGroupItem value="draft">{t('plugins.metric_drafts')} <span className="tabular-nums text-muted-foreground">{draftCount}</span></ToggleGroupItem>
          <ToggleGroupItem value="published">{t('plugins.metric_published')} <span className="tabular-nums text-muted-foreground">{publishedCount}</span></ToggleGroupItem>
        </ToggleGroup>
      </div>
      {notice ? (
        <div className="shrink-0 px-4 pt-4 sm:px-6">
          <Alert variant={notice.error ? 'destructive' : 'default'}>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {loading ? (
        <ListState variant="loading" loadingLabel={t('plugins.loading')} fullHeight />
      ) : error ? (
        <ListState variant="error" errorMessage={error} onRetry={() => { void load(false).catch(() => {}); }} fullHeight />
      ) : notes.length === 0 ? (
        <ListState
          variant="empty"
          icon={<HugeiconsIcon icon={FileEditIcon} />}
          title={t('plugins.empty_title')}
          description={t('plugins.empty_description')}
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" disabled={syncing || entryDirty || navigating || !context?.destination?.repo} onClick={() => setSyncOpen(true)}>
                {syncing ? t('plugins.syncing') : t('plugins.sync')}
              </Button>
              <Button type="button" disabled={navigating} onClick={() => { void openCreate(); }}>{t('plugins.new_entry')}</Button>
            </div>
          )}
          fullHeight
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className={cn('w-full shrink-0 flex-col overflow-hidden border-r sm:flex sm:w-64 lg:w-72', selected ? 'hidden' : 'flex')} aria-label={t('plugins.metric_entries')}>
            <div className="p-3"><Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('plugins.search_entries')} aria-label={t('plugins.search_entries')} /></div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
            {visibleNotes.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">{t('plugins.filter_empty')}</p>
            ) : visibleNotes.map((note) => (
              <EntryRow
                key={note.id}
                note={note}
                locale={i18n.language}
                selected={note.id === selectedId}
                checked={checkedIds.includes(note.id)}
                disabled={navigating}
                onSelect={() => { void selectEntry(note.id); }}
                onCheck={(on) => toggleChecked(note.id, on)}
              />
            ))}
            </div>
          </aside>
          <section className={cn('min-w-0 flex-1 overflow-y-auto p-4 sm:block sm:p-6 lg:p-8', !selected && 'hidden')}>
            {selected ? <Button type="button" variant="ghost" className="mb-3 sm:hidden" disabled={navigating} onClick={() => { void selectEntry(null); }}>{t('plugins.back_to_entries')}</Button> : null}
            {selected ? (
              <PluginEntryEditor
                key={selected.id}
                ref={entryRef}
                onDirtyChange={setEntryDirty}
                pluginId={plugin.id}
                template={template}
                note={selected}
                notes={notes}
                destination={context?.destination ?? null}
                publishing={publishingMany || publishingId === selected.id}
                onNote={replaceNote}
                onNotes={upsertNotes}
                onPublish={(note) => { void publish(note).catch(() => {}); }}
                onDeleted={() => {
                  const id = selected.id;
                  setNotes((current) => current.filter((item) => item.id !== id));
                  setSelectedId(null);
                  setEntryDirty(false);
                  setCheckedIds((current) => current.filter((item) => item !== id));
                  setNotice({ text: t('plugins.deleted'), error: false });
                }}
              />
            ) : (
              <ListState variant="empty" title={t('plugins.select_entry')} description={t('plugins.select_entry_hint')} />
            )}
          </section>
        </div>
      )}
      <AppModal open={dialogOpen} onOpenChange={setDialogOpen}>
        <AppModalContent size="md">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => { void createNote(event).catch(() => {}); }}
          >
            <AppModalHeader title={t('plugins.new_entry_title')} description={t('plugins.new_entry_hint')} />
            <AppModalBody>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="plugin-note-title">{t('plugins.field_title')} *</FieldLabel>
                  <Input
                    id="plugin-note-title"
                    ref={titleRef}
                    value={title}
                    maxLength={240}
                    onChange={(event) => updateTitle(event.target.value)}
                  />
                </Field>
                {requiredFields.map((field) => (
                  <PluginTemplateField key={field.id} pluginId={plugin.id} field={field} value={values[field.id]} onChange={updateField} />
                ))}
              </FieldGroup>
              {createError ? (
                <Alert variant="destructive" className="mt-4">
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              ) : null}
            </AppModalBody>
            <AppModalFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!title.trim() || creating}>
                {creating ? t('common.saving') : t('common.create')}
              </Button>
            </AppModalFooter>
          </form>
        </AppModalContent>
      </AppModal>
      <ConfirmDialog
        isOpen={pendingPublish !== null}
        title={pendingPublish && pendingPublish.entryCount > 1
          ? t('plugins.publish_confirm_many', { count: pendingPublish.entryCount })
          : t('plugins.publish_confirm_one')}
        message={pendingPublish
          ? t('plugins.publish_confirm_hint', { repo: pendingPublish.repo, branch: pendingPublish.branch })
          : ''}
        confirmLabel={t('plugins.publish')}
        busy={confirmingPublish}
        onCancel={dismissPublish}
        onConfirm={() => { void confirmPublish().catch(() => {}); }}
      >
        {pendingPublish && pendingPublish.files.length > 0 ? (
          <ul className="flex max-h-28 flex-col gap-1 overflow-y-auto px-4">
            {pendingPublish.files.map((file) => (
              <li key={file} className="truncate font-mono text-xs text-muted-foreground" title={file}>
                {file.split('/').slice(-2).join('/')}
              </li>
            ))}
          </ul>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        isOpen={syncOpen}
        title={t('plugins.sync_title')}
        message={t('plugins.sync_confirm')}
        confirmLabel={t('plugins.sync')}
        busy={syncing}
        onCancel={() => { if (!syncing) setSyncOpen(false); }}
        onConfirm={() => { void syncRemote().catch(() => {}); }}
      />
    </div>
  );
}

function statusVariant(status: PluginNoteStatus): 'outline' | 'lavender' | 'mint' {
  if (status === 'published') return 'mint';
  if (status === 'changed') return 'lavender';
  return 'outline';
}

function EntryRow({
  note,
  locale,
  selected,
  checked,
  disabled,
  onSelect,
  onCheck,
}: {
  note: PluginNote;
  locale: string;
  selected: boolean;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
  onCheck: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const collection = fieldText(note.fields, 'collection');
  const language = fieldText(note.fields, 'language');
  const date = fieldText(note.fields, 'date');
  const title = note.title || t('notes.untitled_note');
  const location = [
    collection ? pluginSelectOptionLabel('collection', collection, locale) : '',
    language ? pluginSelectOptionLabel('language', language, locale) : '',
  ].filter(Boolean).join(' / ');

  return (
    <div className={selectionSurfaceClass(selected, 'flex w-full min-w-0 items-start gap-2 px-2 py-2')}>
      <Checkbox
        className="mt-0.5"
        checked={checked}
        aria-label={t('plugins.select_for_publish', { title })}
        onCheckedChange={(value) => onCheck(value === true)}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left"
        disabled={disabled}
        aria-current={selected ? 'page' : undefined}
        onClick={onSelect}
      >
        <SafeText className="text-sm font-medium" title={title}>{title}</SafeText>
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          <Badge variant={statusVariant(note.status)}>{t(`plugins.status_${note.status}`)}</Badge>
          {location ? <span className="truncate text-xs text-muted-foreground">{location}</span> : null}
          {date ? <span className="text-xs text-muted-foreground">{date}</span> : null}
        </span>
      </button>
    </div>
  );
}
