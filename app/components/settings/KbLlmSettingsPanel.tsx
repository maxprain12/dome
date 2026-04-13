import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMarked, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db/client';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeListState from '@/components/ui/DomeListState';
import DomeCheckbox from '@/components/ui/DomeCheckbox';
import { DomeInput } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';
import DomeButton from '@/components/ui/DomeButton';

type KbLlmGlobal = {
  enabledGlobal: boolean;
  defaultMode: string;
  compileIntervalMinutes: number;
  healthHour: number;
  autoReindexWikiOnSave: boolean;
  allowAutoWrite: boolean;
};

function BulletList({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-[var(--dome-text-muted,var(--tertiary-text))]">
      {lines.map((line, i) => (
        <li key={i}>{line.replace(/^[-•]\s*/, '')}</li>
      ))}
    </ul>
  );
}

export default function KbLlmSettingsPanel() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [config, setConfig] = useState<KbLlmGlobal | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusProjectId, setStatusProjectId] = useState('default');
  const [status, setStatus] = useState<{
    effectiveEnabled: boolean;
    lastRuns: { compile: { status?: string; finishedAt?: number | null; updatedAt?: number } | null; health: unknown };
  } | null>(null);

  const loadGlobal = useCallback(async () => {
    try {
      const api = window.electron?.kbllm;
      if (!api?.getGlobal) return;
      const res = await api.getGlobal();
      if (res?.success && res.data) setConfig(res.data as KbLlmGlobal);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    const r = await db.getProjects();
    if (r.success && r.data?.length) {
      setProjects(r.data);
      if (!r.data.find((p) => p.id === statusProjectId)) {
        setStatusProjectId(r.data[0].id);
      }
    }
  }, [statusProjectId]);

  const loadStatus = useCallback(async () => {
    try {
      const api = window.electron?.kbllm;
      if (!api?.getStatus) return;
      const res = await api.getStatus(statusProjectId);
      if (res?.success && res.data) {
        setStatus({
          effectiveEnabled: res.data.effectiveEnabled,
          lastRuns: res.data.lastRuns as {
            compile: { status?: string; finishedAt?: number | null; updatedAt?: number } | null;
            health: unknown;
          },
        });
      }
    } catch {
      setStatus(null);
    }
  }, [statusProjectId]);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      await loadGlobal();
      await loadProjects();
      setLoading(false);
    })();
  }, [loadGlobal, loadProjects]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, statusProjectId]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const api = window.electron?.kbllm;
      if (!api?.setGlobal) throw new Error('kbllm API');
      const res = await api.setGlobal(config);
      if (!res?.success) throw new Error(res?.error || 'save');
      showToast('success', t('settings.kb_llm.saved'));
      await loadStatus();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : t('settings.kb_llm.error_save'));
    } finally {
      setSaving(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const api = window.electron?.kbllm;
      if (!api?.syncAll) return;
      const res = await api.syncAll();
      if (res?.success) {
        showToast('success', t('settings.kb_llm.synced'));
        await loadStatus();
      } else throw new Error(res?.error);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  if (loading || !config) {
    return <DomeListState variant="loading" loadingLabel={t('common.loading')} />;
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <DomeSubpageHeader
        title={t('settings.kb_llm.title')}
        subtitle={t('settings.kb_llm.subtitle')}
        trailing={
          <DomeIconBox size="md" className="!w-10 !h-10">
            <BookMarked className="w-5 h-5 text-[var(--accent)]" aria-hidden />
          </DomeIconBox>
        }
        className="rounded-xl border border-[var(--dome-border,var(--border))] bg-[var(--dome-surface,var(--bg-secondary))] px-4 py-3 mb-2"
      />

      <DomeCard>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.kb_llm.section_expectations')}
        </DomeSectionLabel>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1.5 text-[var(--dome-text,var(--primary-text))]">
              {t('settings.kb_llm.expect_good_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_good_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5 text-[var(--dome-text,var(--primary-text))]">
              {t('settings.kb_llm.expect_skip_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_skip_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5 text-[var(--dome-text,var(--primary-text))]">
              {t('settings.kb_llm.expect_limits_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_limits_body')} />
          </div>
          <p className="text-xs pt-1 border-t border-[var(--dome-border,var(--border))] text-[var(--dome-text-muted,var(--tertiary-text))]">
            {t('settings.kb_llm.projects_hint')}
          </p>
        </div>
      </DomeCard>

      <DomeCard>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.kb_llm.section_global')}
        </DomeSectionLabel>
        <DomeCheckbox
          reverse
          className="py-2"
          label={t('settings.kb_llm.enabled_global')}
          checked={config.enabledGlobal}
          onChange={(e) => setConfig({ ...config, enabledGlobal: e.target.checked })}
        />
        <div className="grid gap-4 mt-4 sm:grid-cols-2">
          <DomeInput
            type="number"
            min={15}
            max={1440}
            label={t('settings.kb_llm.compile_interval')}
            value={config.compileIntervalMinutes}
            onChange={(e) =>
              setConfig({ ...config, compileIntervalMinutes: Math.max(15, Number(e.target.value) || 360) })
            }
          />
          <DomeSelect
            label={t('settings.kb_llm.health_hour')}
            value={String(config.healthHour)}
            onChange={(e) => setConfig({ ...config, healthHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </DomeSelect>
        </div>
        <DomeCheckbox
          reverse
          className="py-2 mt-2"
          label={t('settings.kb_llm.auto_reindex')}
          checked={config.autoReindexWikiOnSave}
          onChange={(e) => setConfig({ ...config, autoReindexWikiOnSave: e.target.checked })}
        />
        <DomeCheckbox
          reverse
          className="py-2"
          label={t('settings.kb_llm.allow_auto_write')}
          checked={config.allowAutoWrite}
          onChange={(e) => setConfig({ ...config, allowAutoWrite: e.target.checked })}
        />
        <div className="flex flex-wrap gap-2 mt-4">
          <DomeButton type="button" variant="primary" loading={saving} onClick={() => void handleSave()}>
            {t('settings.kb_llm.save')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="outline"
            loading={syncing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={() => void handleSyncAll()}
          >
            {t('settings.kb_llm.sync_all')}
          </DomeButton>
        </div>
      </DomeCard>

      <DomeCard>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.kb_llm.section_status')}
        </DomeSectionLabel>
        <DomeSelect
          className="max-w-xs"
          label={t('settings.kb_llm.status_project')}
          value={statusProjectId}
          onChange={(e) => setStatusProjectId(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </DomeSelect>
        {status && (
          <div className="text-sm space-y-2 mt-3 text-[var(--dome-text-muted,var(--tertiary-text))]">
            <p>
              <strong className="text-[var(--dome-text,var(--primary-text))]">{t('settings.kb_llm.effective')}:</strong>{' '}
              {status.effectiveEnabled ? t('settings.kb_llm.on') : t('settings.kb_llm.off')}
            </p>
            <p>
              {t('settings.kb_llm.last_compile')}:{' '}
              {status.lastRuns?.compile
                ? `${status.lastRuns.compile.status ?? '—'} · ${formatTs(status.lastRuns.compile.finishedAt ?? status.lastRuns.compile.updatedAt)}`
                : '—'}
            </p>
          </div>
        )}
      </DomeCard>
    </div>
  );
}

function formatTs(ts: number | null | undefined) {
  if (ts == null || !Number.isFinite(ts)) return '—';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '—';
  }
}
