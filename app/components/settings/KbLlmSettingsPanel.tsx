import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookMarked, Loader2, RefreshCw } from 'lucide-react';
import { db } from '@/lib/db/client';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';

const DOME_GREEN = '#596037';

type KbLlmGlobal = {
  enabledGlobal: boolean;
  defaultMode: string;
  compileIntervalMinutes: number;
  healthHour: number;
  autoReindexWikiOnSave: boolean;
  allowAutoWrite: boolean;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

function BulletList({ text }: { text: string }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <ul className="list-disc pl-5 space-y-1.5" style={{ color: 'var(--dome-text-muted)' }}>
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
    }
  };

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--dome-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: DOME_GREEN }}
        >
          <BookMarked className="w-5 h-5" style={{ color: '#E0EAB4' }} />
        </div>
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('settings.kb_llm.title')}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.kb_llm.subtitle')}
          </p>
        </div>
      </div>

      <SettingsCard>
        <SectionLabel>{t('settings.kb_llm.section_expectations')}</SectionLabel>
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.kb_llm.expect_good_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_good_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.kb_llm.expect_skip_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_skip_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.kb_llm.expect_limits_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_limits_body')} />
          </div>
          <p className="text-xs pt-1 border-t" style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}>
            {t('settings.kb_llm.projects_hint')}
          </p>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionLabel>{t('settings.kb_llm.section_global')}</SectionLabel>
        <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
            {t('settings.kb_llm.enabled_global')}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--dome-accent)]"
            checked={config.enabledGlobal}
            onChange={(e) => setConfig({ ...config, enabledGlobal: e.target.checked })}
          />
        </label>
        <div className="grid gap-4 mt-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.kb_llm.compile_interval')}
            </label>
            <input
              type="number"
              min={15}
              max={1440}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--dome-bg)]"
              style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              value={config.compileIntervalMinutes}
              onChange={(e) =>
                setConfig({ ...config, compileIntervalMinutes: Math.max(15, Number(e.target.value) || 360) })
              }
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.kb_llm.health_hour')}
            </label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--dome-bg)]"
              style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              value={config.healthHour}
              onChange={(e) => setConfig({ ...config, healthHour: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 py-2 mt-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
            {t('settings.kb_llm.auto_reindex')}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--dome-accent)]"
            checked={config.autoReindexWikiOnSave}
            onChange={(e) => setConfig({ ...config, autoReindexWikiOnSave: e.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
          <span className="text-sm" style={{ color: 'var(--dome-text)' }}>
            {t('settings.kb_llm.allow_auto_write')}
          </span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--dome-accent)]"
            checked={config.allowAutoWrite}
            onChange={(e) => setConfig({ ...config, allowAutoWrite: e.target.checked })}
          />
        </label>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: DOME_GREEN }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin inline" /> : null}{' '}
            {t('settings.kb_llm.save')}
          </button>
          <button
            type="button"
            onClick={() => void handleSyncAll()}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
          >
            <RefreshCw className="h-4 w-4" />
            {t('settings.kb_llm.sync_all')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionLabel>{t('settings.kb_llm.section_status')}</SectionLabel>
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.kb_llm.status_project')}
          </label>
          <select
            className="w-full max-w-xs rounded-lg border px-3 py-2 text-sm bg-[var(--dome-bg)]"
            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
            value={statusProjectId}
            onChange={(e) => setStatusProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {status && (
          <div className="text-sm space-y-2" style={{ color: 'var(--dome-text-muted)' }}>
            <p>
              <strong style={{ color: 'var(--dome-text)' }}>{t('settings.kb_llm.effective')}:</strong>{' '}
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
      </SettingsCard>
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
