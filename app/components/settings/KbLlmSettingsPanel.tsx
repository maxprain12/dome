import { HugeiconsIcon } from '@hugeicons/react';
import {
  BookMarkedIcon as BookMarked,
  RefreshIcon as RefreshCw,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { db } from '@/lib/db/client';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';
import SubpageHeader from '@/components/shared/SubpageHeader';
import ListState from '@/components/shared/ListState';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    <ul className="list-disc pl-5 flex flex-col gap-1.5 text-[var(--muted-foreground)]">
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
          effectiveEnabled: res.data.effectiveEnabled ?? false,
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
    return <ListState variant="loading" loadingLabel={t('common.loading')} />;
  }

  return (
    <SettingsPanel className="!gap-6">
      <SubpageHeader className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 mb-2">
        <SubpageHeader.Title>{t('settings.kb_llm.title')}</SubpageHeader.Title>
        <SubpageHeader.Subtitle>{t('settings.kb_llm.subtitle')}</SubpageHeader.Subtitle>
        <SubpageHeader.Trailing>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
            <HugeiconsIcon icon={BookMarked} className="size-5 text-primary" aria-hidden />
          </div>
        </SubpageHeader.Trailing>
      </SubpageHeader>

      <Card className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
          {t('settings.kb_llm.section_expectations')}
        </p>
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-semibold mb-1.5 text-[var(--foreground)]">
              {t('settings.kb_llm.expect_good_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_good_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5 text-[var(--foreground)]">
              {t('settings.kb_llm.expect_skip_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_skip_body')} />
          </div>
          <div>
            <p className="font-semibold mb-1.5 text-[var(--foreground)]">
              {t('settings.kb_llm.expect_limits_title')}
            </p>
            <BulletList text={t('settings.kb_llm.expect_limits_body')} />
          </div>
          <p className="text-xs pt-1 border-t border-[var(--border)] text-[var(--muted-foreground)]">
            {t('settings.kb_llm.projects_hint')}
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
          {t('settings.kb_llm.section_global')}
        </p>
        <div className="flex items-center justify-between gap-3 py-2">
          <Label htmlFor="kb-enabled-global" className="cursor-pointer text-sm">
            {t('settings.kb_llm.enabled_global')}
          </Label>
          <Checkbox
            id="kb-enabled-global"
            checked={config.enabledGlobal}
            onCheckedChange={(v) => setConfig({ ...config, enabledGlobal: v === true })}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field className="gap-1.5"><FieldLabel htmlFor="fld-input-6" className="text-xs">{t('settings.kb_llm.compile_interval')}</FieldLabel><Input id="fld-input-6" type="number" min={15} max={1440} value={config.compileIntervalMinutes} onChange={(e) =>
              setConfig({ ...config, compileIntervalMinutes: Math.max(15, Number(e.target.value) || 360) })
            } /></Field>
          <Field className="gap-1.5"><FieldLabel className="text-xs">{t('settings.kb_llm.health_hour')}</FieldLabel><Select value={String(config.healthHour)} onValueChange={(next) => setConfig({ ...config, healthHour: Number(next) })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
            {Array.from({ length: 24 }, (_, h) => (
              <SelectItem key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </SelectItem>
            ))}
          </SelectGroup></SelectContent></Select></Field>
        </div>
        <div className="flex items-center justify-between gap-3 py-2 mt-2">
          <Label htmlFor="kb-auto-reindex" className="cursor-pointer text-sm">
            {t('settings.kb_llm.auto_reindex')}
          </Label>
          <Checkbox
            id="kb-auto-reindex"
            checked={config.autoReindexWikiOnSave}
            onCheckedChange={(v) => setConfig({ ...config, autoReindexWikiOnSave: v === true })}
          />
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <Label htmlFor="kb-allow-auto-write" className="cursor-pointer text-sm">
            {t('settings.kb_llm.allow_auto_write')}
          </Label>
          <Checkbox
            id="kb-allow-auto-write"
            checked={config.allowAutoWrite}
            onCheckedChange={(v) => setConfig({ ...config, allowAutoWrite: v === true })}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button type="button"
  loading={saving}
  onClick={() => void handleSave()}>
            {t('settings.kb_llm.save')}
          </Button>
          <Button type="button"
  variant="outline"
  loading={syncing}
  onClick={() => void handleSyncAll()}>{<HugeiconsIcon icon={RefreshCw} className="size-4" />}
            {t('settings.kb_llm.sync_all')}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">
          {t('settings.kb_llm.section_status')}
        </p>
        <Field className="gap-1.5 max-w-xs"><FieldLabel className="text-xs">{t('settings.kb_llm.status_project')}</FieldLabel><Select value={statusProjectId} onValueChange={(next) => { if (next != null) setStatusProjectId(next); }}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectGroup></SelectContent></Select></Field>
        {status && (
          <div className="text-sm flex flex-col gap-2 mt-3 text-[var(--muted-foreground)]">
            <p>
              <strong className="text-[var(--foreground)]">{t('settings.kb_llm.effective')}:</strong>{' '}
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
      </Card>
    </SettingsPanel>
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
