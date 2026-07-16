import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BookMarkedIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { db } from '@/lib/db/client';
import type { Project } from '@/types';
import { showToast } from '@/lib/store/useToastStore';

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
    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
      {lines.map((line, i) => (
        <li key={i}>{line.replace(/^[-•]\s*/, '')}</li>
      ))}
    </ul>
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

export default function KbLlmSection() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [config, setConfig] = useState<KbLlmGlobal | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [statusProjectId, setStatusProjectId] = useState('default');
  const [status, setStatus] = useState<{
    effectiveEnabled: boolean;
    lastRuns: {
      compile: { status?: string; finishedAt?: number | null; updatedAt?: number } | null;
      health: unknown;
    };
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
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <SettingsSurface
      icon={BookMarkedIcon}
      title={t('settings.kb_llm.title')}
      description={t('settings.kb_llm.subtitle')}
    >
      <SettingsGroup title={t('settings.kb_llm.section_expectations')}>
        <div className="flex flex-col gap-4 px-4 py-4 text-sm">
          <div>
            <p className="mb-1.5 font-semibold">{t('settings.kb_llm.expect_good_title')}</p>
            <BulletList text={t('settings.kb_llm.expect_good_body')} />
          </div>
          <div>
            <p className="mb-1.5 font-semibold">{t('settings.kb_llm.expect_skip_title')}</p>
            <BulletList text={t('settings.kb_llm.expect_skip_body')} />
          </div>
          <div>
            <p className="mb-1.5 font-semibold">{t('settings.kb_llm.expect_limits_title')}</p>
            <BulletList text={t('settings.kb_llm.expect_limits_body')} />
          </div>
          <p className="border-t pt-2 text-xs text-muted-foreground">
            {t('settings.kb_llm.projects_hint')}
          </p>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.kb_llm.section_global')}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {t('settings.kb_llm.save')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncing}
              onClick={() => void handleSyncAll()}
            >
              {syncing ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
              )}
              {t('settings.kb_llm.sync_all')}
            </Button>
          </>
        }
      >
        <SettingsRow
          title={t('settings.kb_llm.enabled_global')}
          htmlFor="kb-enabled-global"
          control={
            <Switch
              id="kb-enabled-global"
              checked={config.enabledGlobal}
              onCheckedChange={(v) => setConfig({ ...config, enabledGlobal: v === true })}
            />
          }
        />
        <div className="grid gap-4 px-4 py-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="kb-compile-interval">
              {t('settings.kb_llm.compile_interval')}
            </FieldLabel>
            <Input
              id="kb-compile-interval"
              type="number"
              min={15}
              max={1440}
              value={config.compileIntervalMinutes}
              onChange={(e) =>
                setConfig({
                  ...config,
                  compileIntervalMinutes: Math.max(15, Number(e.target.value) || 360),
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel>{t('settings.kb_llm.health_hour')}</FieldLabel>
            <Select
              value={String(config.healthHour)}
              onValueChange={(next) => setConfig({ ...config, healthHour: Number(next) })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <SettingsRow
          title={t('settings.kb_llm.auto_reindex')}
          htmlFor="kb-auto-reindex"
          control={
            <Switch
              id="kb-auto-reindex"
              checked={config.autoReindexWikiOnSave}
              onCheckedChange={(v) => setConfig({ ...config, autoReindexWikiOnSave: v === true })}
            />
          }
        />
        <SettingsRow
          title={t('settings.kb_llm.allow_auto_write')}
          htmlFor="kb-allow-auto-write"
          control={
            <Switch
              id="kb-allow-auto-write"
              checked={config.allowAutoWrite}
              onCheckedChange={(v) => setConfig({ ...config, allowAutoWrite: v === true })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.kb_llm.section_status')}>
        <div className="flex flex-col gap-3 px-4 py-4">
          <Field className="max-w-xs">
            <FieldLabel>{t('settings.kb_llm.status_project')}</FieldLabel>
            <Select
              value={statusProjectId}
              onValueChange={(next) => {
                if (next != null) setStatusProjectId(next);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {status ? (
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">{t('settings.kb_llm.effective')}:</strong>{' '}
                {status.effectiveEnabled ? t('settings.kb_llm.on') : t('settings.kb_llm.off')}
              </p>
              <p>
                {t('settings.kb_llm.last_compile')}:{' '}
                {status.lastRuns?.compile
                  ? `${status.lastRuns.compile.status ?? '—'} · ${formatTs(
                      status.lastRuns.compile.finishedAt ?? status.lastRuns.compile.updatedAt,
                    )}`
                  : '—'}
              </p>
            </div>
          ) : null}
        </div>
      </SettingsGroup>
    </SettingsSurface>
  );
}
