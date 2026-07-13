import { HugeiconsIcon } from '@hugeicons/react';
import {
  Download04Icon as Download,
  RefreshIcon as RefreshCw,
  RotateRight01Icon as RotateCw,
  FileStackIcon as FileStack,
  CheckmarkCircle02Icon as CheckCircle2,
  Upload04Icon as Upload,
  ArrowDownToLineIcon as ArrowDownToLine,
} from '@hugeicons/core-free-icons';
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import type { CitationStyle } from '@/types';
import SubpageHeader from '@/components/shared/SubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  percent?: number;
  error?: string;
}

const citationStyles: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'apa',       label: 'APA',       description: 'American Psychological Association' },
  { value: 'mla',       label: 'MLA',       description: 'Modern Language Association' },
  { value: 'chicago',   label: 'Chicago',   description: 'Chicago Manual of Style' },
  { value: 'harvard',   label: 'Harvard',   description: 'Harvard Referencing' },
  { value: 'vancouver', label: 'Vancouver', description: 'Vancouver System' },
  { value: 'ieee',      label: 'IEEE',      description: 'Electrical & Electronics Engineers' },
];

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs mt-0.5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} size="sm" className="shrink-0" />
    </div>
  );
}

export default function AdvancedSettings() {
  const { t } = useTranslation();
  const { citationStyle, autoSave, autoBackup, updateCitationStyle, updatePreferences } = useAppStore();
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [appVersion, setAppVersion] = useState<string>('');
  const [notesMigrationStatus, setNotesMigrationStatus] = useState<{ pendingMigrations: number; notes: { id: string; title: string }[] } | null>(null);
  const [notesMigrating, setNotesMigrating] = useState(false);

  useEffect(() => {
    void window.electron?.getAppVersion?.().then((r) => {
      if (typeof r === 'string') {
        setAppVersion(r || '0.1.0');
        return;
      }
      if (r && typeof r === 'object' && 'success' in r && r.success === true && typeof (r as { data?: unknown }).data === 'string') {
        setAppVersion((r as { data: string }).data || '0.1.0');
        return;
      }
      setAppVersion('0.1.0');
    });
  }, []);

  useEffect(() => {
    if (!window.electron?.updater?.onStatus) return;
    const unsub = window.electron.updater.onStatus((s) => setUpdaterState(s as UpdaterState));
    return unsub;
  }, []);

  useEffect(() => {
    async function loadMigrationStatus() {
      try {
        const r = await window.electron?.migration?.getNotesMigrationStatus?.();
        if (r?.success && r.data) setNotesMigrationStatus(r.data);
      } catch { /* ignore */ }
    }
    loadMigrationStatus();
  }, [notesMigrating]);

  const handleCheckUpdate = async () => {
    setUpdaterState(s => ({ ...s, status: 'checking' }));
    try {
      const result = await window.electron?.updater?.check() as { status?: string } | null;
      if (result?.status === 'skipped') setUpdaterState({ status: 'idle' });
    } catch (e) { setUpdaterState({ status: 'error', error: String(e) }); }
  };

  const handleMigrateNotes = async () => {
    setNotesMigrating(true);
    try {
      const r = await window.electron?.migration?.migrateNotesToDomain?.();
      if (r?.success) {
        const status = await window.electron?.migration?.getNotesMigrationStatus?.();
        if (status?.success && status.data) setNotesMigrationStatus(status.data);
      }
    } finally { setNotesMigrating(false); }
  };

  return (
    <SettingsPanel>
      <SubpageHeader className={"!border-0 p-0 bg-transparent"}>
  <SubpageHeader.Title>{t('settings.advanced.title')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('settings.advanced.subtitle')}</SubpageHeader.Subtitle>
</SubpageHeader>

      {/* ── Updates ── */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.advanced.updates')}</p>
        <Card className="p-4 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Dome</p>
              <p className="text-xs text-muted-foreground">
                {t('settings.advanced.current_version')}: <span className="font-mono">{appVersion || '—'}</span>
              </p>
            </div>

            {updaterState.status === 'idle' ? (
              <Button type="button"
  variant="outline"
  onClick={() => void handleCheckUpdate()}
  size="sm">{<HugeiconsIcon icon={RefreshCw} className="size-3" aria-hidden />}
                {t('settings.advanced.check_updates')}
              </Button>
            ) : null}
            {updaterState.status === 'checking' && (
              <span className="text-xs flex items-center gap-1.5 text-muted-foreground">
                <HugeiconsIcon icon={RefreshCw} className="size-3 animate-spin" /> {t('settings.advanced.checking')}
              </span>
            )}
            {updaterState.status === 'not-available' && (
              <span className="text-xs flex items-center gap-1.5 text-primary">
                <HugeiconsIcon icon={CheckCircle2} className="size-3.5" /> {t('settings.advanced.up_to_date')}
              </span>
            )}
            {updaterState.status === 'available' ? (
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <Button type="button"
  onClick={() => window.electron?.updater?.download()}
  size="sm">{<HugeiconsIcon icon={Download} className="size-3" aria-hidden />}
                  {t('settings.advanced.download_version', { version: updaterState.version })}
                </Button>
                <Button type="button"
  variant="outline"
  onClick={async () => {
                    const v = updaterState.version;
                    if (!v) return;
                    await window.electron?.updater?.skip(v);
                    setUpdaterState({ status: 'not-available', version: v });
                  }}
  size="sm">
                  {t('settings.advanced.skip_this_version')}
                </Button>
              </div>
            ) : null}
            {updaterState.status === 'downloaded' ? (
              <Button type="button"
  onClick={() => window.electron?.updater?.install()}
  size="sm">{<HugeiconsIcon icon={RotateCw} className="size-3" aria-hidden />}
                {t('settings.advanced.restart_install')}
              </Button>
            ) : null}
            {updaterState.status === 'error' && (
              <span className="text-xs text-destructive">
                {updaterState.error || t('settings.advanced.error_update')}
              </span>
            )}
          </div>

          {updaterState.status === 'downloading' ? (
            <div className="w-full min-w-0">
              <div className="mb-1.5 text-xs text-muted-foreground">
                <span className="flex w-full justify-between">
                  <span>{t('settings.advanced.downloading')}</span>
                  <span className="font-medium text-primary">{updaterState.percent?.toFixed(0) ?? 0}%</span>
                </span>
              </div>
              <Progress value={updaterState.percent ?? 0} className="h-1.5" />
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── Preferences ── */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.advanced.preferences')}</p>
        <Card className="p-4">
          <ToggleRow
            label={t('settings.advanced.auto_save')}
            description={t('settings.advanced.auto_save_desc')}
            checked={autoSave}
            onChange={(v) => updatePreferences({ autoSave: v })}
          />
          <Separator className="!my-0 mx-4" />
          <ToggleRow
            label={t('settings.advanced.auto_backup')}
            description={t('settings.advanced.auto_backup_desc')}
            checked={autoBackup}
            onChange={(v) => updatePreferences({ autoBackup: v })}
          />
        </Card>
      </div>

      {/* ── Citation style ── */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ">{t('settings.advanced.citation_style')}</p>
        <ToggleGroup
          value={[citationStyle]}
          onValueChange={(values) => values[0] && updateCitationStyle(values[0] as CitationStyle)}
          aria-label={t('settings.advanced.citation_style')}
          className="mt-2 flex w-full flex-wrap"
        >
          {citationStyles.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} variant="outline" className="min-w-24 flex-1">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-[10px] text-muted-foreground mt-2">
          {citationStyles.find((s) => s.value === citationStyle)?.description}
        </p>
      </div>

      {/* ── Data ── */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.advanced.data')}</p>
        <Card className="p-4 p-4 flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium mb-0.5 text-foreground">
              {t('settings.advanced.export_import')}
            </p>
            <p className="text-xs mb-3 text-muted-foreground">
              {t('settings.advanced.export_import_desc')}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button type="button"
  variant="outline"
  onClick={async () => {
                  const r = await window.electron?.sync?.export?.();
                  if (r?.success) showToast('success', t('settings.advanced.export_completed', { path: r.path }));
                  else if (!r?.cancelled) showToast('error', r?.error || t('common.unknown_error'));
                }}
  size="sm">{<HugeiconsIcon icon={ArrowDownToLine} className="size-3.5" aria-hidden />}
                {t('settings.advanced.export_data')}
              </Button>
              <Button type="button"
  variant="outline"
  onClick={async () => {
                  const r = await window.electron?.sync?.import?.();
                  if (r?.success) {
                    showToast('success', r.restartRequired ? t('settings.advanced.import_restart') : t('settings.advanced.import_completed'));
                    if (r.restartRequired) window.setTimeout(() => window.location.reload(), 1000);
                  } else if (!r?.cancelled) showToast('error', r?.error || t('common.unknown_error'));
                }}
  size="sm">{<HugeiconsIcon icon={Upload} className="size-3.5" aria-hidden />}
                {t('settings.advanced.import_data')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Notes migration ── */}
      {typeof window !== 'undefined' && window.electron?.migration && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.advanced.migration')}</p>
          <Card className="p-4 p-4">
            <p className="text-sm font-medium mb-0.5 text-foreground">
              {t('settings.advanced.notes_migration_title')}
            </p>
            <p className="text-xs mb-3 text-muted-foreground">
              {t('settings.advanced.notes_migration_desc')}
            </p>
            {notesMigrationStatus && notesMigrationStatus.pendingMigrations > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {t('settings.advanced.pending_notes', { count: notesMigrationStatus.pendingMigrations })}
                </span>
                <Button type="button"
  onClick={() => void handleMigrateNotes()}
  disabled={notesMigrating}
  size="sm">{<HugeiconsIcon icon={FileStack} className="size-3.5" aria-hidden />}
                  {notesMigrating ? t('settings.advanced.migrating') : t('settings.advanced.migrate_notes')}
                </Button>
              </div>
            ) : notesMigrationStatus?.pendingMigrations === 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <HugeiconsIcon icon={CheckCircle2} className="size-3.5" /> {t('settings.advanced.all_migrated')}
              </span>
            ) : null}
          </Card>
        </div>
      )}
    </SettingsPanel>
  );
}
