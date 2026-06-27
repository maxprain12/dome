import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, FolderOpen, RefreshCw, Loader2 } from 'lucide-react';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';
import { showToast } from '@/lib/store/useToastStore';
import {
  loadPersonalityContextFiles,
  type PersonalityContextFiles,
} from '@/lib/personality/contextFiles';

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

  const handleOpenFolder = () => {
    void window.electron?.personality?.openFolder?.();
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
    if (isDirty && !window.confirm(t('settings.ai.context_unsaved_confirm'))) return;
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
    <div className="space-y-4">
      <DomeSubpageHeader
        title={t('settings.ai.tab_context')}
        subtitle={t('settings.ai.context_subtitle')}
      />

      <div className="settings-action-row flex-wrap">
        <DomeButton
          variant="secondary"
          size="sm"
          onClick={handleOpenFolder}
          leftIcon={<FolderOpen size={14} />}
        >
          {t('settings.ai.context_open_folder')}
        </DomeButton>
        <DomeButton
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          leftIcon={loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          disabled={loading}
        >
          {t('common.refresh')}
        </DomeButton>
      </div>

      <DomeSegmentedControl
        size="sm"
        value={selectedDoc}
        onChange={(v) => handleSelectDoc(v as ContextDocId)}
        options={docOptions}
      />

      {selectedDoc === 'daily' && dailyLogs.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {dailyLogs.map((log) => (
            <DomeButton
              key={log.date}
              type="button"
              size="sm"
              variant={selectedDailyDate === log.date ? 'primary' : 'outline'}
              onClick={() => setSelectedDailyDate(log.date)}
            >
              {log.date}
            </DomeButton>
          ))}
        </div>
      ) : null}

      {selectedDoc !== 'daily' ? (
        <DomeSegmentedControl
          size="sm"
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { value: 'full', label: t('settings.ai.context_view_full') },
            { value: 'agent', label: t('settings.ai.context_view_agent') },
          ]}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {viewMode === 'full' || selectedDoc === 'daily' ? (
          <>
            <DomeButton
              type="button"
              size="sm"
              variant={editMode === 'view' ? 'primary' : 'outline'}
              onClick={() => setEditMode('view')}
            >
              {t('settings.ai.context_mode_view')}
            </DomeButton>
            <DomeButton
              type="button"
              size="sm"
              variant={editMode === 'edit' ? 'primary' : 'outline'}
              onClick={() => setEditMode('edit')}
            >
              {t('settings.ai.context_mode_edit')}
            </DomeButton>
          </>
        ) : null}
        <DomeButton type="button" size="sm" variant="ghost" onClick={() => void handleCopy()} leftIcon={<Copy size={14} />}>
          {t('common.copy')}
        </DomeButton>
        {editMode === 'edit' && (viewMode === 'full' || selectedDoc === 'daily') ? (
          <>
            <DomeButton type="button" size="sm" variant="primary" loading={saving} disabled={!isDirty} onClick={() => void handleSave()}>
              {t('common.save')}
            </DomeButton>
            <DomeButton
              type="button"
              size="sm"
              variant="outline"
              disabled={!isDirty}
              onClick={() => setDraftContent(savedContent)}
            >
              {t('settings.ai.context_discard')}
            </DomeButton>
          </>
        ) : null}
      </div>

      {viewMode === 'agent' && selectedDoc !== 'daily' ? (
        <DomeCallout tone="info">{t('settings.ai.context_agent_view_hint')}</DomeCallout>
      ) : null}

      {overLimit ? (
        <DomeCallout tone="warning">
          {t('settings.ai.context_over_limit', { limit: charLimit ?? 0, count: draftContent.length })}
        </DomeCallout>
      ) : null}

      <DomeCallout tone="info">{t('settings.ai.context_memory_toggle_hint')}</DomeCallout>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--secondary-text)]">
          <Loader2 size={16} className="animate-spin" />
          {t('ui.loading')}
        </div>
      ) : editMode === 'edit' && (viewMode === 'full' || selectedDoc === 'daily') ? (
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          className="w-full min-h-[320px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 font-mono text-xs leading-relaxed text-[var(--primary-text)]"
          spellCheck={false}
        />
      ) : (
        <pre className="max-h-[420px] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--primary-text)]">
          {displayedContent || t('settings.ai.context_empty')}
        </pre>
      )}
    </div>
  );
}
