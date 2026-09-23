import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import MarkdownNoteEditor, { type MarkdownNoteEditorHandle } from '@/components/markdown/MarkdownNoteEditor';
import PluginTemplateField from '@/components/plugins/PluginTemplateField';
import { chat } from '@/lib/ai/client';
import { requestPlugin } from '@/lib/plugins/request';
import { adaptationBatchPrompt, parseAdaptedBatch } from '@/lib/plugins/adapt-languages';
import { ingestLocalMarkdownImages, pluginSiteImageMap, type PluginSiteImage } from '@/lib/plugins/media';
import {
  cmsDestinationPath,
  fieldScalar,
  hasLocalMedia,
  publicEntryUrl,
  siblingLanguageKeys,
} from '@/lib/plugins/fields';
import { openExternalHref } from '@/components/people/peopleContactActions';
import type { PluginFieldValues, PluginHostContext, PluginNote, PluginVaultTemplate } from '@/types/plugin';

export interface PluginEntryEditorHandle {
  save: () => Promise<PluginNote | null>;
  isDirty: () => boolean;
}

const PluginEntryEditor = forwardRef<PluginEntryEditorHandle, {
  pluginId: string;
  template: PluginVaultTemplate;
  note: PluginNote;
  notes?: PluginNote[];
  destination: PluginHostContext['destination'];
  publishing: boolean;
  onNote: (note: PluginNote) => void;
  onNotes?: (notes: PluginNote[]) => void;
  onPublish: (note: PluginNote) => void;
  onDeleted: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}>(function PluginEntryEditor({
  pluginId,
  template,
  note,
  notes = [],
  destination,
  publishing,
  onNote,
  onNotes,
  onPublish,
  onDeleted,
  onDirtyChange,
}, ref) {
  const { t } = useTranslation();
  const editorRef = useRef<MarkdownNoteEditorHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [values, setValues] = useState<PluginFieldValues>(note.fields);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const changeSeq = useRef(0);
  const savedRevision = useRef(note.updatedAt);
  const savedDigest = useRef(note.contentDigest);
  const savePromise = useRef<Promise<PluginNote | null> | null>(null);
  const saveRef = useRef<() => Promise<PluginNote | null>>(() => Promise.resolve(null));
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const markDirty = () => {
    changeSeq.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    setMessage(null);
  };
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'pull' | 'delete' | null>(null);
  const [deleteRemote, setDeleteRemote] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [siteImageMap, setSiteImageMap] = useState<Map<string, string> | null>(null);

  const refreshSiteImages = useCallback(() => {
    return requestPlugin<PluginSiteImage[]>(pluginId, 'media.list')
      .then((next) => {
        setSiteImageMap(pluginSiteImageMap(next));
      })
      .catch(() => {
        setSiteImageMap(new Map());
      });
  }, [pluginId]);

  useEffect(() => {
    setSiteImageMap(null);
    void refreshSiteImages();
  }, [refreshSiteImages, note.id]);

  useEffect(() => {
    if (note.updatedAt === savedRevision.current) return;
    if (dirtyRef.current && (!note.contentDigest || note.contentDigest !== savedDigest.current)) {
      setError(t('plugins.conflict'));
      return;
    }
    savedRevision.current = note.updatedAt;
    savedDigest.current = note.contentDigest;
    if (dirtyRef.current) return;
    const nextBody = note.body;
    setTitle(note.title);
    setBody(nextBody);
    setValues(note.fields);
    editorRef.current?.setMarkdown(nextBody);
  }, [note, t]);

  const path = cmsDestinationPath(destination, values);
  const published = note.status === 'published';
  const entryUrl = published ? publicEntryUrl(destination, values) : null;
  const siblingLanguages = useMemo(
    () => siblingLanguageKeys(
      destination?.contentPaths,
      fieldScalar(values, 'collection'),
      fieldScalar(values, 'language'),
    ),
    [destination?.contentPaths, values],
  );
  const hasTranslations = notes.some((item) => (
    item.id !== note.id && Boolean(item.familyId) && item.familyId === note.familyId
  ));
  const localMedia = hasLocalMedia(body, values);

  const updateField = (id: string, value: string | string[]) => {
    setValues((current) => ({ ...current, [id]: value }));
    markDirty();
  };

  const save = (): Promise<PluginNote | null> => {
    if (savePromise.current) return savePromise.current;
    if (!title.trim()) return Promise.resolve(null);
    const sequence = changeSeq.current;
    const nextBody = editorRef.current?.getMarkdown() ?? body;
    setSaving(true);
    setError(null);
    const pending = (async () => {
      try {
        const ingested = await ingestLocalMarkdownImages(pluginId, note.id, nextBody);
        const updated = await requestPlugin<PluginNote>(pluginId, 'notes.update', {
          id: note.id,
          expectedUpdatedAt: savedRevision.current,
          expectedContentDigest: savedDigest.current,
          title: title.trim(),
          body: ingested.markdown,
          fields: values,
        });
        savedRevision.current = updated.updatedAt;
        savedDigest.current = updated.contentDigest;
        const unchanged = sequence === changeSeq.current;
        if (unchanged) {
          if (ingested.changed) editorRef.current?.setMarkdown(ingested.markdown);
          setBody(ingested.markdown);
          dirtyRef.current = false;
          setDirty(false);
          setMessage(t('plugins.saved_entry'));
        }
        onNote(updated);
        // Never navigate or publish an older snapshot while the user is still editing.
        return unchanged ? updated : null;
      } catch (cause) {
        const text = cause instanceof Error ? cause.message : '';
        setError(text.startsWith('CONFLICT:') ? t('plugins.conflict') : text || t('plugins.save_error'));
        return null;
      } finally {
        savePromise.current = null;
        setSaving(false);
      }
    })();
    savePromise.current = pending;
    return pending;
  };

  useImperativeHandle(ref, () => ({ save, isDirty: () => dirtyRef.current }));
  saveRef.current = save;

  const explain = (cause: unknown, fallback: string) => {
    const text = cause instanceof Error ? cause.message : '';
    if (text.startsWith('CONFLICT:')) return t('plugins.conflict');
    if (text === 'REMOTE_NOT_FOUND') return t('plugins.pull_missing');
    if (text === 'LOCAL_MEDIA_FORBIDDEN') return t('plugins.local_media_forbidden');
    if (text === 'ADAPT_PARSE' || text === 'ADAPT_NONE') return t('plugins.adapt_error');
    return text || fallback;
  };

  const adaptLanguages = async () => {
    if (siblingLanguages.length === 0) {
      setError(t('plugins.adapt_none'));
      return;
    }
    setAdapting(true);
    setError(null);
    try {
      const familyId = note.familyId || globalThis.crypto.randomUUID();
      const ingested = await ingestLocalMarkdownImages(
        pluginId,
        note.id,
        editorRef.current?.getMarkdown() ?? body,
      );
      const sourceTitle = title.trim();
      const sourceFields = values;
      const translations = parseAdaptedBatch(await chat([
        { role: 'system', content: 'You return only JSON for a batch of CMS translations.' },
        {
          role: 'user',
          content: adaptationBatchPrompt({
            sourceLanguage: fieldScalar(sourceFields, 'language'),
            targets: siblingLanguages,
            title: sourceTitle,
            description: fieldScalar(sourceFields, 'description'),
            slug: fieldScalar(sourceFields, 'slug'),
            body: ingested.markdown,
          }),
        },
      ]), siblingLanguages, sourceTitle);
      const result = await requestPlugin<{ notes: PluginNote[] }>(pluginId, 'notes.applyTranslations', {
        sourceId: note.id,
        expectedUpdatedAt: savedRevision.current,
        expectedContentDigest: savedDigest.current,
        familyId,
        title: sourceTitle,
        body: ingested.markdown,
        fields: sourceFields,
        translations,
      });
      dirtyRef.current = false;
      setDirty(false);
      onNotes?.(result.notes);
      setMessage(hasTranslations ? t('plugins.translations_updated') : t('plugins.adapted_languages'));
    } catch (cause) {
      setError(explain(cause, t('plugins.adapt_error')));
    } finally {
      setAdapting(false);
    }
  };

  const pullEntry = async () => {
    setPulling(true);
    setError(null);
    try {
      const updated = await requestPlugin<PluginNote>(pluginId, 'notes.pull', { id: note.id });
      dirtyRef.current = false;
      setDirty(false);
      onNote(updated);
      setMessage(t('plugins.pulled'));
      setConfirm(null);
    } catch (cause) {
      setError(explain(cause, t('plugins.pull_error')));
      setConfirm(null);
    } finally {
      setPulling(false);
    }
  };

  const deleteEntry = async () => {
    setDeleting(true);
    setError(null);
    try {
      await requestPlugin(pluginId, 'notes.delete', { id: note.id, remote: deleteRemote });
      setConfirm(null);
      onDeleted();
    } catch (cause) {
      setError(explain(cause, t('plugins.delete_error')));
      setConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || pulling || deleting || publishing || adapting;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      if (!formRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      if (dirty && !busy) void saveRef.current();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [busy, dirty]);

  return (
    <>
    <form
      ref={formRef}
      className="mx-auto flex w-full max-w-5xl min-h-0 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save().catch(() => {});
      }}
    >
      <div className="min-w-0">
        <Field>
          <FieldLabel htmlFor="cms-entry-title">{t('plugins.field_title')}</FieldLabel>
          <Input
            id="cms-entry-title"
            value={title}
            disabled={pulling || adapting || deleting}
            maxLength={240}
            onChange={(event) => {
              setTitle(event.target.value);
              markDirty();
            }}
          />
        </Field>
        <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={path || undefined}>
          {path || t('plugins.no_destination')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" aria-label={t('notes.more_actions')} disabled={busy} />}>
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!destination?.repo} onClick={() => setConfirm('pull')}>{t('plugins.pull')}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => { setDeleteRemote(false); setConfirm('delete'); }}>{t('common.delete')}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          variant="outline"
          disabled={busy || siblingLanguages.length === 0}
          onClick={() => { void adaptLanguages().catch(() => {}); }}
        >
          {adapting
            ? (hasTranslations ? t('plugins.updating_translations') : t('plugins.adapting_languages'))
            : (hasTranslations ? t('plugins.update_translations') : t('plugins.adapt_languages'))}
        </Button>
        {entryUrl ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => { openExternalHref(entryUrl); }}
          >
            {t('plugins.view_publication')}
          </Button>
        ) : null}
        <Badge variant={published ? 'mint' : note.status === 'changed' ? 'lavender' : 'outline'}>
          {dirty ? t('notes.save_dirty') : t(`plugins.status_${note.status}`)}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={!dirty || busy || !title.trim()}>
            {saving ? t('common.saving') : t('plugins.save_entry')}
          </Button>
          <Button
            type="button"
            disabled={busy || (published && !dirty) || !title.trim() || localMedia || !destination?.repo}
            onClick={() => {
              void (async () => {
                const current = dirty ? await save() : note;
                if (current) onPublish(current);
              })().catch(() => {});
            }}
          >
            {publishing ? t('plugins.publishing') : published && !dirty ? t('plugins.published') : t('plugins.publish')}
          </Button>
        </div>
      </div>
      {localMedia ? (
        <Alert variant="destructive">
          <AlertDescription>{t('plugins.local_media_forbidden')}</AlertDescription>
        </Alert>
      ) : null}
      <Collapsible open={propertiesOpen} onOpenChange={setPropertiesOpen} className="rounded-lg border">
        <CollapsibleTrigger render={<Button type="button" variant="ghost" className="w-full justify-between" />}>
          {t('plugins.entry_properties')}
          <HugeiconsIcon icon={ArrowDown01Icon} />
        </CollapsibleTrigger>
        <CollapsibleContent keepMounted>
          <fieldset disabled={pulling || adapting || deleting} className="min-w-0 p-4">
      <FieldGroup className="grid gap-3 md:grid-cols-2">
        {template.fields.map((field) => (
          <PluginTemplateField
            key={field.id}
            pluginId={pluginId}
            field={field}
            value={values[field.id]}
            onChange={updateField}
            onMediaChange={() => { void refreshSiteImages(); }}
          />
        ))}
      </FieldGroup>
          </fieldset>
        </CollapsibleContent>
      </Collapsible>
      <Field>
        <FieldLabel htmlFor="cms-entry-body">{t('plugins.body')}</FieldLabel>
        <div className="min-w-0">
          {siteImageMap ? (
            <MarkdownNoteEditor
              key={note.id}
              id="cms-entry-body"
              readOnly={pulling || adapting || deleting}
              ref={editorRef}
              initialMarkdown={body}
              pluginId={pluginId}
              resourceId={note.id}
              siteImageMap={siteImageMap}
              className="markdown-note-editor-host--cms"
              onChange={() => {
                setBody(editorRef.current?.getMarkdown() ?? body);
                markDirty();
              }}
            />
          ) : (
            <div className="min-h-60" aria-busy="true" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('plugins.body_hint')}</p>
      </Field>
      {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    </form>
    <ConfirmDialog
      isOpen={confirm === 'pull'}
      title={t('plugins.pull_title')}
      message={dirty ? t('plugins.pull_dirty') : t('plugins.pull_confirm', { path: path || '' })}
      confirmLabel={t('plugins.pull')}
      busy={pulling}
      onCancel={() => { if (!pulling) setConfirm(null); }}
      onConfirm={() => { void pullEntry().catch(() => {}); }}
    />
    <ConfirmDialog
      isOpen={confirm === 'delete'}
      variant="danger"
      title={t('plugins.delete_title')}
      message={t('plugins.delete_confirm')}
      confirmLabel={t('common.delete')}
      busy={deleting}
      onCancel={() => { if (!deleting) setConfirm(null); }}
      onConfirm={() => { void deleteEntry().catch(() => {}); }}
    >
      {destination?.repo ? (
        <label className="flex items-start gap-2 px-4 pb-2 text-sm">
          <Checkbox
            checked={deleteRemote}
            onCheckedChange={(checked) => setDeleteRemote(checked === true)}
            aria-label={t('plugins.delete_remote')}
          />
          <span>{t('plugins.delete_remote', { path: path || '' })}</span>
        </label>
      ) : null}
    </ConfirmDialog>
    </>
  );
});

export default PluginEntryEditor;
