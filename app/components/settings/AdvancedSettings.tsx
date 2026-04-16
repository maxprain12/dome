
import { useState, useEffect } from 'react';
import { Download, RefreshCw, RotateCw, FileStack, CheckCircle2, Upload, ArrowDownToLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CitationStyle } from '@/types';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeDivider from '@/components/ui/DomeDivider';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeSegmentedControl from '@/components/ui/DomeSegmentedControl';

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
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{description}</p>
      </div>
      <DomeToggle checked={checked} onChange={onChange} size="sm" />
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
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title={t('settings.advanced.title')}
        subtitle={t('settings.advanced.subtitle')}
      />

      {/* ── Updates ── */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.advanced.updates')}</DomeSectionLabel>
        <DomeCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Dome</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                {t('settings.advanced.current_version')}: <span className="font-mono">{appVersion || '—'}</span>
              </p>
            </div>

            {updaterState.status === 'idle' ? (
              <DomeButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleCheckUpdate()}
                leftIcon={<RefreshCw className="w-3 h-3" aria-hidden />}
              >
                {t('settings.advanced.check_updates')}
              </DomeButton>
            ) : null}
            {updaterState.status === 'checking' && (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                <RefreshCw className="w-3 h-3 animate-spin" /> {t('settings.advanced.checking')}
              </span>
            )}
            {updaterState.status === 'not-available' && (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--dome-accent)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.advanced.up_to_date')}
              </span>
            )}
            {updaterState.status === 'available' ? (
              <div className="flex flex-wrap items-center gap-2 justify-end">
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.electron?.updater?.download()}
                  leftIcon={<Download className="w-3 h-3" aria-hidden />}
                >
                  {t('settings.advanced.download_version', { version: updaterState.version })}
                </DomeButton>
                <DomeButton
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
                </DomeButton>
              </div>
            ) : null}
            {updaterState.status === 'downloaded' ? (
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                onClick={() => window.electron?.updater?.install()}
                leftIcon={<RotateCw className="w-3 h-3" aria-hidden />}
              >
                {t('settings.advanced.restart_install')}
              </DomeButton>
            ) : null}
            {updaterState.status === 'error' && (
              <span className="text-xs" style={{ color: 'var(--dome-error, #ef4444)' }}>
                {updaterState.error || t('settings.advanced.error_update')}
              </span>
            )}
          </div>

          {updaterState.status === 'downloading' ? (
            <DomeProgressBar
              value={updaterState.percent ?? 0}
              max={100}
              size="sm"
              label={
                <span className="flex w-full justify-between">
                  <span>{t('settings.advanced.downloading')}</span>
                  <span className="font-medium text-[var(--dome-accent)]">{updaterState.percent?.toFixed(0) ?? 0}%</span>
                </span>
              }
            />
          ) : null}
        </DomeCard>
      </div>

      {/* ── Preferences ── */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.advanced.preferences')}</DomeSectionLabel>
        <DomeCard>
          <ToggleRow
            label={t('settings.advanced.auto_save')}
            description={t('settings.advanced.auto_save_desc')}
            checked={autoSave}
            onChange={(v) => updatePreferences({ autoSave: v })}
          />
          <DomeDivider spacingClass="!my-0 mx-4" />
          <ToggleRow
            label={t('settings.advanced.auto_backup')}
            description={t('settings.advanced.auto_backup_desc')}
            checked={autoBackup}
            onChange={(v) => updatePreferences({ autoBackup: v })}
          />
        </DomeCard>
      </div>

      {/* ── Citation style ── */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.advanced.citation_style')}</DomeSectionLabel>
        <DomeSegmentedControl
          className="w-full"
          aria-label={t('settings.advanced.citation_style')}
          options={citationStyles.map((s) => ({ value: s.value, label: s.label }))}
          value={citationStyle}
          onChange={(v) => updateCitationStyle(v as CitationStyle)}
        />
        <p className="text-[10px] text-[var(--dome-text-muted)] mt-2">
          {citationStyles.find((s) => s.value === citationStyle)?.description}
        </p>
      </div>

      {/* ── Data ── */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.advanced.data')}</DomeSectionLabel>
        <DomeCard className="p-4 space-y-3">
          <div>
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.advanced.export_import')}
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.advanced.export_import_desc')}
            </p>
            <div className="flex gap-2 flex-wrap">
              <DomeButton
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const r = await window.electron?.sync?.export?.();
                  if (r?.success) alert(t('settings.advanced.export_completed', { path: r.path }));
                  else if (!r?.cancelled) alert('Error: ' + (r?.error || t('common.unknown_error')));
                }}
                leftIcon={<ArrowDownToLine className="w-3.5 h-3.5" aria-hidden />}
              >
                {t('settings.advanced.export_data')}
              </DomeButton>
              <DomeButton
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const r = await window.electron?.sync?.import?.();
                  if (r?.success) {
                    alert(r.restartRequired ? t('settings.advanced.import_restart') : t('settings.advanced.import_completed'));
                    if (r.restartRequired) window.location.reload();
                  } else if (!r?.cancelled) alert('Error: ' + (r?.error || t('common.unknown_error')));
                }}
                leftIcon={<Upload className="w-3.5 h-3.5" aria-hidden />}
              >
                {t('settings.advanced.import_data')}
              </DomeButton>
            </div>
          </div>
        </DomeCard>
      </div>

      {/* ── Notes migration ── */}
      {typeof window !== 'undefined' && window.electron?.migration && (
        <div>
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.advanced.migration')}</DomeSectionLabel>
          <DomeCard className="p-4">
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>
              {t('settings.advanced.notes_migration_title')}
            </p>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.advanced.notes_migration_desc')}
            </p>
            {notesMigrationStatus && notesMigrationStatus.pendingMigrations > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('settings.advanced.pending_notes', { count: notesMigrationStatus.pendingMigrations })}
                </span>
                <DomeButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void handleMigrateNotes()}
                  disabled={notesMigrating}
                  leftIcon={<FileStack className="w-3.5 h-3.5" aria-hidden />}
                >
                  {notesMigrating ? t('settings.advanced.migrating') : t('settings.advanced.migrate_notes')}
                </DomeButton>
              </div>
            ) : notesMigrationStatus?.pendingMigrations === 0 ? (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--dome-accent)' }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> {t('settings.advanced.all_migrated')}
              </span>
            ) : null}
          </DomeCard>
        </div>
      )}
    </div>
  );
}
