import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CopyIcon,
  FolderOpenIcon,
  InformationCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SettingsGroup } from '../blocks';
import { showToast } from '@/lib/store/useToastStore';
import {
  loadPersonalityContextFiles,
  type PersonalityContextFiles,
} from '@/lib/personality/contextFiles';

type ContextDocId = 'SOUL' | 'USER' | 'MEMORY' | 'daily' | 'social' | 'email';
type ViewMode = 'full' | 'agent';
type EditMode = 'view' | 'edit';

type DailyLog = { date: string; content: string };

const CONTEXT_LIMITS: Record<'SOUL' | 'USER' | 'MEMORY' | 'social' | 'email', number> = {
  SOUL: 24_000,
  USER: 12_000,
  MEMORY: 16_000,
  social: 8_000,
  email: 8_000,
};

function filenameForDoc(doc: Exclude<ContextDocId, 'daily'>): string {
  if (doc === 'social' || doc === 'email') return `domains/${doc}.md`;
  return `${doc}.md`;
}

function isCoreDoc(doc: ContextDocId): boolean {
  return doc === 'SOUL' || doc === 'USER' || doc === 'MEMORY';
}

function supportsViewEditToggle(doc: ContextDocId, viewMode: ViewMode): boolean {
  return viewMode === 'full' || doc === 'daily' || doc === 'social' || doc === 'email';
}

function shouldShowEditor(doc: ContextDocId, viewMode: ViewMode, editMode: EditMode): boolean {
  return editMode === 'edit' && (viewMode === 'full' || doc === 'daily');
}

function shouldShowAgentViewHint(doc: ContextDocId, viewMode: ViewMode): boolean {
  return viewMode === 'agent' && isCoreDoc(doc);
}

function shouldShowSaveButtons(doc: ContextDocId, viewMode: ViewMode, editMode: EditMode): boolean {
  return editMode === 'edit' && supportsViewEditToggle(doc, viewMode);
}

function shouldShowDailyLogs(doc: ContextDocId, dailyLogs: DailyLog[]): boolean {
  return doc === 'daily' && dailyLogs.length > 0;
}

function getCharLimit(doc: ContextDocId): number | null {
  return doc !== 'daily' ? CONTEXT_LIMITS[doc as keyof typeof CONTEXT_LIMITS] : null;
}

function isOverLimit(charLimit: number | null, content: string): boolean {
  return charLimit != null && content.length > charLimit * 1.1;
}

function applyPendingDoc(
  pendingDoc: ContextDocId | null,
  setEditMode: (mode: EditMode) => void,
  setViewMode: (mode: ViewMode) => void,
  setSelectedDoc: (doc: ContextDocId) => void,
  setPendingDoc: (doc: ContextDocId | null) => void,
): void {
  if (!pendingDoc) {
    setPendingDoc(null);
    return;
  }
  setEditMode('view');
  if (pendingDoc !== 'daily') setViewMode('full');
  setSelectedDoc(pendingDoc);
  setPendingDoc(null);
}

/** SOUL/USER/MEMORY + daily-log editor for the agent's persistent context files. */
export default function AgentContextSettingsTab() {
  const { t } = useTranslation();
  const [selectedDoc, setSelectedDoc] = useState<ContextDocId>('SOUL');
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [editMode, setEditMode] = useState<EditMode>('view');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullContent, setFullContent] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [agentView, setAgentView] = useState<PersonalityContextFiles | null>(null);
  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [selectedDailyDate, setSelectedDailyDate] = useState<string | null>(null);
  const [pendingDoc, setPendingDoc] = useState<ContextDocId | null>(null);

  const isDirty = editMode === 'edit' && draftContent !== savedContent;

  const displayedContent = useMemo(() => {
    if (selectedDoc === 'daily') return fullContent;
    if (selectedDoc === 'social' || selectedDoc === 'email') {
      return editMode === 'edit' ? draftContent : fullContent;
    }
    if (viewMode === 'agent' && agentView) {
      if (selectedDoc === 'SOUL') return agentView.soul;
      if (selectedDoc === 'USER') return agentView.user;
      return agentView.memory;
    }
    return editMode === 'edit' ? draftContent : fullContent;
  }, [agentView, draftContent, editMode, fullContent, selectedDoc, viewMode]);

  const loadAgentView = useCallback(async () => {
    const files = await loadPersonalityContextFiles();
    setAgentView(files);
  }, []);

  const loadDailyLogs = useCallback(async (): Promise<DailyLog[]> => {
    const api = window.electron?.personality;
    if (!api?.listDailyMemory) return [];
    const res = await api.listDailyMemory(14);
    if (res.success && Array.isArray(res.data)) {
      setDailyLogs(res.data);
      return res.data;
    }
    setDailyLogs([]);
    return [];
  }, []);

  const loadDocument = useCallback(
    async (doc: ContextDocId, dailyDate?: string | null) => {
      setLoading(true);
      try {
        if (doc === 'daily') {
          const logs = await loadDailyLogs();
          const date = dailyDate ?? selectedDailyDate ?? logs[0]?.date ?? null;
          setSelectedDailyDate(date);
          const text = date ? (logs.find((d) => d.date === date)?.content ?? '') : '';
          setFullContent(text);
          setDraftContent(text);
          setSavedContent(text);
          return;
        }

        const api = window.electron?.personality;
        if (!api?.readFile) return;
        const res = await api.readFile(filenameForDoc(doc));
        const text = res.success && typeof res.data === 'string' ? res.data : '';
        setFullContent(text);
        setDraftContent(text);
        setSavedContent(text);
        await loadAgentView();
      } finally {
        setLoading(false);
      }
    },
    [loadAgentView, loadDailyLogs, selectedDailyDate],
  );

  useEffect(() => {
    void loadDocument(selectedDoc, selectedDailyDate);
  }, [selectedDoc, selectedDailyDate, loadDocument]);

  const handleRefresh = () => {
    void loadDocument(selectedDoc, selectedDailyDate);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedContent);
      showToast('info', t('settings.ai.context_copied'));
    } catch {
      showToast('error', t('media.transcript_copy_failed'));
    }
  };

  const handleSelectDoc = (doc: ContextDocId) => {
    if (isDirty) {
      setPendingDoc(doc);
      return;
    }
    setEditMode('view');
    if (isCoreDoc(doc)) setViewMode('full');
    setSelectedDoc(doc);
  };

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const api = window.electron?.personality;
      if (selectedDoc === 'daily') {
        if (!selectedDailyDate || !api?.writeDailyMemory) return;
        const res = await api.writeDailyMemory(selectedDailyDate, draftContent);
        if (!res.success) throw new Error(res.error || 'save failed');
      } else if (api?.writeFile) {
        const res = await api.writeFile(filenameForDoc(selectedDoc), draftContent);
        if (!res.success) throw new Error(res.error || 'save failed');
      }
      setFullContent(draftContent);
      setSavedContent(draftContent);
      setEditMode('view');
      await loadAgentView();
      if (selectedDoc === 'daily') await loadDailyLogs();
      showToast('success', t('settings.ai.context_saved'));
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const charLimit = getCharLimit(selectedDoc);
  const overLimit = isOverLimit(charLimit, draftContent);

  const docOptions = [
    { value: 'SOUL' as const, label: t('settings.ai.context_doc_soul') },
    { value: 'USER' as const, label: t('settings.ai.context_doc_user') },
    { value: 'MEMORY' as const, label: t('settings.ai.context_doc_memory') },
    { value: 'social' as const, label: t('settings.ai.context_doc_social') },
    { value: 'email' as const, label: t('settings.ai.context_doc_email') },
    { value: 'daily' as const, label: t('settings.ai.context_doc_daily') },
  ];

  return (
    <SettingsGroup
      title={t('settings.ai.tab_context')}
      description={t('settings.ai.context_subtitle')}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void window.electron?.personality?.openFolder?.()}
          >
            <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" />
            {t('settings.ai.context_open_folder')}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={handleRefresh} disabled={loading} aria-label={t('common.refresh')} title={t('common.refresh')}>
            {loading ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-4">
        <Tabs value={selectedDoc} onValueChange={(v) => handleSelectDoc(v as ContextDocId)}>
          <TabsList className="w-full">
            {docOptions.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1">
                <span className="truncate">{opt.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {shouldShowDailyLogs(selectedDoc, dailyLogs) ? (
          <div className="flex flex-wrap gap-2">
            {dailyLogs.map((log) => (
              <Button
                key={log.date}
                type="button"
                variant={selectedDailyDate === log.date ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedDailyDate(log.date)}
              >
                {log.date}
              </Button>
            ))}
          </div>
        ) : null}

        {isCoreDoc(selectedDoc) ? (
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="full">{t('settings.ai.context_view_full')}</TabsTrigger>
              <TabsTrigger value="agent">{t('settings.ai.context_view_agent')}</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {supportsViewEditToggle(selectedDoc, viewMode) ? (
            <>
              <Button
                type="button"
                variant={editMode === 'view' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditMode('view')}
              >
                {t('settings.ai.context_mode_view')}
              </Button>
              <Button
                type="button"
                variant={editMode === 'edit' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditMode('edit')}
              >
                {t('settings.ai.context_mode_edit')}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleCopy()}>
            <HugeiconsIcon icon={CopyIcon} data-icon="inline-start" />
            {t('common.copy')}
          </Button>
          {shouldShowSaveButtons(selectedDoc, viewMode, editMode) ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? <Spinner data-icon="inline-start" /> : null}
                {t('common.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isDirty}
                onClick={() => setDraftContent(savedContent)}
              >
                {t('settings.ai.context_discard')}
              </Button>
            </>
          ) : null}
        </div>

        {shouldShowAgentViewHint(selectedDoc, viewMode) ? (
          <Alert role="note">
            <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
            <AlertDescription className="text-xs">
              {t('settings.ai.context_agent_view_hint')}
            </AlertDescription>
          </Alert>
        ) : null}

        {overLimit ? (
          <Alert role="note">
            <HugeiconsIcon icon={Alert02Icon} aria-hidden />
            <AlertDescription className="text-xs">
              {t('settings.ai.context_over_limit', {
                limit: charLimit ?? 0,
                count: draftContent.length,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <Alert role="note">
          <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
          <AlertDescription className="text-xs">
            {t('settings.ai.context_memory_toggle_hint')}
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {t('ui.loading')}
          </div>
        ) : shouldShowEditor(selectedDoc, viewMode, editMode) ? (
          <Textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            className="min-h-[320px] w-full rounded-lg bg-background p-3 font-mono text-xs leading-relaxed"
            spellCheck={false}
            aria-label={t('settings.ai.tab_context')}
          />
        ) : (
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed">
            {displayedContent || t('settings.ai.context_empty')}
          </pre>
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDoc !== null}
        title={t('settings.ai.context_unsaved_confirm')}
        message={t('settings.ai.context_unsaved_confirm')}
        onConfirm={() =>
          applyPendingDoc(pendingDoc, setEditMode, setViewMode, setSelectedDoc, setPendingDoc)
        }
        onCancel={() => setPendingDoc(null)}
      />
    </SettingsGroup>
  );
}
