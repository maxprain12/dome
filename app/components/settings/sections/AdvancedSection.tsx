import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDownToLineIcon,
  CheckmarkCircle02Icon,
  Download04Icon,
  FileStackIcon,
  RefreshIcon,
  RotateRight01Icon,
  Settings01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';
import type { CitationStyle } from '@/types';

type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  percent?: number;
  error?: string;
}

const CITATION_STYLES: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'apa', label: 'APA', description: 'American Psychological Association' },
  { value: 'mla', label: 'MLA', description: 'Modern Language Association' },
  { value: 'chicago', label: 'Chicago', description: 'Chicago Manual of Style' },
  { value: 'harvard', label: 'Harvard', description: 'Harvard Referencing' },
  { value: 'vancouver', label: 'Vancouver', description: 'Vancouver System' },
  { value: 'ieee', label: 'IEEE', description: 'Electrical & Electronics Engineers' },
];

export default function AdvancedSection() {
  const { t } = useTranslation();
  const { citationStyle, autoSave, autoBackup, updateCitationStyle, updatePreferences } =
    useAppStore();
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [appVersion, setAppVersion] = useState<string>('');
  const [notesMigrationStatus, setNotesMigrationStatus] = useState<{
    pendingMigrations: number;
    notes: { id: string; title: string }[];
  } | null>(null);
  const [notesMigrating, setNotesMigrating] = useState(false);

  useEffect(() => {
    void window.electron?.getAppVersion?.().then((r) => {
      if (typeof r === 'string') {
        setAppVersion(r || '0.1.0');
        return;
      }
      if (
        r &&
        typeof r === 'object' &&
        'success' in r &&
        r.success === true &&
        typeof (r as { data?: unknown }).data === 'string'
      ) {
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
      } catch {
        /* ignore */
      }
    }
    loadMigrationStatus();
  }, [notesMigrating]);

  const handleCheckUpdate = async () => {
    setUpdaterState((s) => ({ ...s, status: 'checking' }));
    try {
      const result = (await window.electron?.updater?.check()) as { status?: string } | null;
      if (result?.status === 'skipped') setUpdaterState({ status: 'idle' });
    } catch (e) {
      setUpdaterState({ status: 'error', error: String(e) });
    }
  };

  const handleMigrateNotes = async () => {
    setNotesMigrating(true);
    try {
      const r = await window.electron?.migration?.migrateNotesToDomain?.();
      if (r?.success) {
        const status = await window.electron?.migration?.getNotesMigrationStatus?.();
        if (status?.success && status.data) setNotesMigrationStatus(status.data);
      }
    } finally {
      setNotesMigrating(false);
    }
  };

  const handleExport = async () => {
    const r = await window.electron?.sync?.export?.();
    if (r?.success) showToast('success', t('settings.advanced.export_completed', { path: r.path }));
    else if (!r?.cancelled) showToast('error', r?.error || t('common.unknown_error'));
  };

  const handleImport = async () => {
    const r = await window.electron?.sync?.import?.();
    if (r?.success) {
      showToast(
        'success',
        r.restartRequired
          ? t('settings.advanced.import_restart')
          : t('settings.advanced.import_completed'),
      );
      if (r.restartRequired) window.setTimeout(() => window.location.reload(), 1000);
    } else if (!r?.cancelled) {
      showToast('error', r?.error || t('common.unknown_error'));
    }
  };

  const updaterControl = (() => {
    switch (updaterState.status) {
      case 'idle':
        return (
          <Button type="button" variant="outline" size="sm" onClick={() => void handleCheckUpdate()}>
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            {t('settings.advanced.check_updates')}
          </Button>
        );
      case 'checking':
        return (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Spinner /> {t('settings.advanced.checking')}
          </span>
        );
      case 'not-available':
        return (
          <span className="flex items-center gap-1.5 text-xs text-primary">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} /> {t('settings.advanced.up_to_date')}
          </span>
        );
      case 'available':
        return (
          <span className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" onClick={() => window.electron?.updater?.download()}>
              <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
              {t('settings.advanced.download_version', { version: updaterState.version })}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const v = updaterState.version;
                if (!v) return;
                await window.electron?.updater?.skip(v);
                setUpdaterState({ status: 'not-available', version: v });
              }}
            >
              {t('settings.advanced.skip_this_version')}
            </Button>
          </span>
        );
      case 'downloaded':
        return (
          <Button type="button" size="sm" onClick={() => window.electron?.updater?.install()}>
            <HugeiconsIcon icon={RotateRight01Icon} data-icon="inline-start" />
            {t('settings.advanced.restart_install')}
          </Button>
        );
      case 'error':
        return (
          <span className="text-xs text-destructive">
            {updaterState.error || t('settings.advanced.error_update')}
          </span>
        );
      default:
        return undefined;
    }
  })();

  return (
    <SettingsSurface
      icon={Settings01Icon}
      title={t('settings.advanced.title')}
      description={t('settings.advanced.subtitle')}
    >
      <SettingsGroup title={t('settings.advanced.updates')}>
        <SettingsRow
          title="Dome"
          description={
            <>
              {t('settings.advanced.current_version')}:{' '}
              <span className="font-mono">{appVersion || '—'}</span>
            </>
          }
          control={updaterControl}
        >
          {updaterState.status === 'downloading' ? (
            <div className="min-w-0">
              <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{t('settings.advanced.downloading')}</span>
                <span className="font-medium text-primary">
                  {updaterState.percent?.toFixed(0) ?? 0}%
                </span>
              </div>
              <Progress value={updaterState.percent ?? 0} className="h-1.5" />
            </div>
          ) : null}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.advanced.preferences')}>
        <SettingsRow
          title={t('settings.advanced.auto_save')}
          description={t('settings.advanced.auto_save_desc')}
          control={
            <Switch
              checked={autoSave}
              onCheckedChange={(v) => updatePreferences({ autoSave: v })}
              aria-label={t('settings.advanced.auto_save')}
            />
          }
        />
        <SettingsRow
          title={t('settings.advanced.auto_backup')}
          description={t('settings.advanced.auto_backup_desc')}
          control={
            <Switch
              checked={autoBackup}
              onCheckedChange={(v) => updatePreferences({ autoBackup: v })}
              aria-label={t('settings.advanced.auto_backup')}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.advanced.citation_style')} bare>
        <ToggleGroup
          value={[citationStyle]}
          onValueChange={(values) => values[0] && updateCitationStyle(values[0] as CitationStyle)}
          aria-label={t('settings.advanced.citation_style')}
          className="flex w-full flex-wrap"
        >
          {CITATION_STYLES.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              variant="outline"
              className="min-w-24 flex-1"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {CITATION_STYLES.find((s) => s.value === citationStyle)?.description}
        </p>
      </SettingsGroup>

      <SettingsGroup title={t('settings.advanced.data')}>
        <SettingsRow
          title={t('settings.advanced.export_import')}
          description={t('settings.advanced.export_import_desc')}
        >
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()}>
              <HugeiconsIcon icon={ArrowDownToLineIcon} data-icon="inline-start" />
              {t('settings.advanced.export_data')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleImport()}>
              <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />
              {t('settings.advanced.import_data')}
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {typeof window !== 'undefined' && window.electron?.migration ? (
        <SettingsGroup title={t('settings.advanced.migration')}>
          <SettingsRow
            title={t('settings.advanced.notes_migration_title')}
            description={t('settings.advanced.notes_migration_desc')}
          >
            {notesMigrationStatus && notesMigrationStatus.pendingMigrations > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {t('settings.advanced.pending_notes', {
                    count: notesMigrationStatus.pendingMigrations,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={notesMigrating}
                  onClick={() => void handleMigrateNotes()}
                >
                  <HugeiconsIcon icon={FileStackIcon} data-icon="inline-start" />
                  {notesMigrating
                    ? t('settings.advanced.migrating')
                    : t('settings.advanced.migrate_notes')}
                </Button>
              </div>
            ) : notesMigrationStatus?.pendingMigrations === 0 ? (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} /> {t('settings.advanced.all_migrated')}
              </span>
            ) : null}
          </SettingsRow>
        </SettingsGroup>
      ) : null}
    </SettingsSurface>
  );
}
