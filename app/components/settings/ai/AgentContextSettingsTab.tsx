import { HugeiconsIcon } from '@hugeicons/react';
import {
  CopyIcon as Copy,
  FolderOpenIcon as FolderOpen,
  RefreshIcon as RefreshCw,
  Loading03Icon as Loader2,
  Alert02Icon as AlertTriangle,
  InformationCircleIcon as Info,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';

import SubpageHeader from '@/components/shared/SubpageHeader';
import { showToast } from '@/lib/store/useToastStore';
import {
  loadPersonalityContextFiles,
  type PersonalityContextFiles,
} from '@/lib/personality/contextFiles';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
type ContextDocId = 'SOUL' | 'USER' | 'MEMORY' | 'daily';
type ViewMode = 'full' | 'agent';
type EditMode = 'view' | 'edit';

type DailyLog = { date: string; content: string };

const CONTEXT_LIMITS: Record<'SOUL' | 'USER' | 'MEMORY', number> = {
  SOUL: 24_000,
  USER: 12_000,
  MEMORY: 16_000,
};

function filenameForDoc(doc: Exclude<ContextDocId, 'daily'>): string {
  return `${doc === 'SOUL' ? 'SOUL' : doc === 'USER' ? 'USER' : 'MEMORY'}.md`;
}

function openAgentContextFolder() {
  void window.electron?.personality?.openFolder?.();
}

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
          const text = date ? logs.find((d) => d.date === date)?.content ?? '' : '';
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
      showToast('error', t('viewer.transcript_copy_failed'));
    }
  };

  const handleSelectDoc = (doc: ContextDocId) => {
    if (isDirty) {
      setPendingDoc(doc);
      return;
    }
    setEditMode('view');
    if (doc !== 'daily') setViewMode('full');
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

  const charLimit =
    selectedDoc !== 'daily' ? CONTEXT_LIMITS[selectedDoc as keyof typeof CONTEXT_LIMITS] : null;
  const overLimit = charLimit != null && draftContent.length > charLimit * 1.1;

  const docOptions = [
    { value: 'SOUL' as const, label: t('settings.ai.context_doc_soul') },
    { value: 'USER' as const, label: t('settings.ai.context_doc_user') },
    { value: 'MEMORY' as const, label: t('settings.ai.context_doc_memory') },
    { value: 'daily' as const, label: t('settings.ai.context_doc_daily') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <SubpageHeader>
  <SubpageHeader.Title>{t('settings.ai.tab_context')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('settings.ai.context_subtitle')}</SubpageHeader.Subtitle>
</SubpageHeader>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="secondary"
  onClick={openAgentContextFolder}
  size="sm">{<HugeiconsIcon icon={FolderOpen} size={14} />}
          {t('settings.ai.context_open_folder')}
        </Button>
        <Button variant="ghost"
  onClick={handleRefresh}
  disabled={loading}
  size="sm">{loading ? <HugeiconsIcon icon={Loader2} size={14} className="animate-spin" /> : <HugeiconsIcon icon={RefreshCw} size={14} />}
          {t('common.refresh')}
        </Button>
      </div>

      <Tabs value={selectedDoc} onValueChange={(v) => handleSelectDoc(v as ContextDocId)} className="min-w-0"><TabsList className="h-auto w-full max-w-full flex-wrap">{(docOptions).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>

      {selectedDoc === 'daily' && dailyLogs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dailyLogs.map((log) => (
            <Button key={log.date}
  type="button"
  variant={selectedDailyDate === log.date ? 'default' : 'outline'}
  onClick={() => setSelectedDailyDate(log.date)}
  size="sm">
              {log.date}
            </Button>
          ))}
        </div>
      ) : null}

      {selectedDoc !== 'daily' ? (
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="min-w-0"><TabsList className="h-auto w-full max-w-full flex-wrap">{([
            { value: 'full', label: t('settings.ai.context_view_full') },
            { value: 'agent', label: t('settings.ai.context_view_agent') },
          ]).map((opt: { value: string; label: string; icon?: ReactNode }) => (<TabsTrigger key={opt.value} value={opt.value} className="min-w-0 flex-1 px-2.5 py-1 text-xs">{opt.icon != null ? <span className="shrink-0 [&_svg]:size-3.5">{opt.icon}</span> : null}<span className="truncate">{opt.label}</span></TabsTrigger>))}</TabsList></Tabs>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {viewMode === 'full' || selectedDoc === 'daily' ? (
          <>
            <Button type="button"
  variant={editMode === 'view' ? 'default' : 'outline'}
  onClick={() => setEditMode('view')}
  size="sm">
              {t('settings.ai.context_mode_view')}
            </Button>
            <Button type="button"
  variant={editMode === 'edit' ? 'default' : 'outline'}
  onClick={() => setEditMode('edit')}
  size="sm">
              {t('settings.ai.context_mode_edit')}
            </Button>
          </>
        ) : null}
        <Button type="button"
  variant="ghost"
  onClick={() => void handleCopy()}
  size="sm">{<HugeiconsIcon icon={Copy} size={14} />}
          {t('common.copy')}
        </Button>
        {editMode === 'edit' && (viewMode === 'full' || selectedDoc === 'daily') ? (
          <>
            <Button type="button"
  loading={saving}
  disabled={!isDirty}
  onClick={() => void handleSave()}
  size="sm">
              {t('common.save')}
            </Button>
            <Button type="button"
  variant="outline"
  disabled={!isDirty}
  onClick={() => setDraftContent(savedContent)}
  size="sm">
              {t('settings.ai.context_discard')}
            </Button>
          </>
        ) : null}
      </div>

      {viewMode === 'agent' && selectedDoc !== 'daily' ? (
        <Alert role="note"><HugeiconsIcon icon={Info} aria-hidden /><AlertDescription className="text-xs">{t('settings.ai.context_agent_view_hint')}</AlertDescription></Alert>
      ) : null}

      {overLimit ? (
        <Alert role="note"><HugeiconsIcon icon={AlertTriangle} aria-hidden /><AlertDescription className="text-xs">
          {t('settings.ai.context_over_limit', { limit: charLimit ?? 0, count: draftContent.length })}
        </AlertDescription></Alert>
      ) : null}

      <Alert role="note"><HugeiconsIcon icon={Info} aria-hidden /><AlertDescription className="text-xs">{t('settings.ai.context_memory_toggle_hint')}</AlertDescription></Alert>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon icon={Loader2} size={16} className="animate-spin" />
          {t('ui.loading')}
        </div>
      ) : editMode === 'edit' && (viewMode === 'full' || selectedDoc === 'daily') ? (
        <Textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          className="w-full min-h-[320px] rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground"
          spellCheck={false}
        />
      ) : (
        <pre className="max-h-[420px] overflow-auto rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground">
          {displayedContent || t('settings.ai.context_empty')}
        </pre>
      )}
      <ConfirmDialog
        isOpen={pendingDoc !== null}
        title={t('settings.ai.context_unsaved_confirm')}
        message={t('settings.ai.context_unsaved_confirm')}
        onConfirm={() => {
          if (pendingDoc) {
            setEditMode('view');
            if (pendingDoc !== 'daily') setViewMode('full');
            setSelectedDoc(pendingDoc);
          }
          setPendingDoc(null);
        }}
        onCancel={() => setPendingDoc(null)}
      />
    </div>
  );
}
