
import { useState, useEffect } from 'react';
import { Download, RefreshCw, RotateCw, FileStack, CheckCircle2, Upload, ArrowDownToLine } from 'lucide-react';
import { useAppStore } from '@/lib/store/useAppStore';
import type { CitationStyle } from '@/types';

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';

interface UpdaterState {
  status: UpdaterStatus;
  version?: string;
  percent?: number;
  error?: string;
}

const citationStyles: { value: CitationStyle; label: string; description: string }[] = [
  { value: 'apa',      label: 'APA',       description: 'American Psychological Association' },
  { value: 'mla',      label: 'MLA',       description: 'Modern Language Association' },
  { value: 'chicago',  label: 'Chicago',   description: 'Chicago Manual of Style' },
  { value: 'harvard',  label: 'Harvard',   description: 'Harvard Referencing' },
  { value: 'vancouver',label: 'Vancouver', description: 'Vancouver System' },
  { value: 'ieee',     label: 'IEEE',      description: 'Electrical & Electronics Engineers' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
      style={{ backgroundColor: checked ? DOME_GREEN : 'var(--dome-border)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{label}</p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function AdvancedSettings() {
  const { citationStyle, autoSave, autoBackup, updateCitationStyle, updatePreferences } = useAppStore();
  const [updaterState, setUpdaterState] = useState<UpdaterState>({ status: 'idle' });
  const [appVersion, setAppVersion] = useState<string>('');
  const [notesMigrationStatus, setNotesMigrationStatus] = useState<{ pendingMigrations: number; notes: { id: string; title: string }[] } | null>(null);
  const [notesMigrating, setNotesMigrating] = useState(false);

  useEffect(() => { window.electron?.getAppVersion?.().then((v) => setAppVersion(v || '0.1.0')); }, []);

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
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>Avanzado</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Actualizaciones, preferencias del sistema y datos.</p>
      </div>

      {/* ── Updates ── */}
      <div>
        <SectionLabel>Actualizaciones</SectionLabel>
        <SettingsCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Dome</p>
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                Versión actual: <span className="font-mono">{appVersion || '—'}</span>
              </p>
            </div>

            {updaterState.status === 'idle' && (
              <button
                onClick={handleCheckUpdate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              >
                <RefreshCw className="w-3 h-3" /> Buscar actualizaciones
              </button>
            )}
            {updaterState.status === 'checking' && (
              <span className="text-xs flex items-center gap-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                <RefreshCw className="w-3 h-3 animate-spin" /> Verificando...
              </span>
            )}
            {updaterState.status === 'not-available' && (
              <span className="text-xs flex items-center gap-1.5" style={{ color: DOME_GREEN }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Al día
              </span>
            )}
            {updaterState.status === 'available' && (
              <button
                onClick={() => window.electron?.updater?.download()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: DOME_GREEN }}
              >
                <Download className="w-3 h-3" /> Descargar v{updaterState.version}
              </button>
            )}
            {updaterState.status === 'downloaded' && (
              <button
                onClick={() => window.electron?.updater?.install()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: DOME_GREEN }}
              >
                <RotateCw className="w-3 h-3" /> Reiniciar e instalar
              </button>
            )}
            {updaterState.status === 'error' && (
              <span className="text-xs" style={{ color: 'var(--dome-error, #ef4444)' }}>
                {updaterState.error || 'Error al verificar'}
              </span>
            )}
          </div>

          {updaterState.status === 'downloading' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Descargando...</span>
                <span className="text-xs font-medium" style={{ color: DOME_GREEN }}>{updaterState.percent?.toFixed(0) ?? 0}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dome-border)' }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${updaterState.percent ?? 0}%`, backgroundColor: DOME_GREEN }}
                />
              </div>
            </div>
          )}
        </SettingsCard>
      </div>

      {/* ── Preferences ── */}
      <div>
        <SectionLabel>Preferencias</SectionLabel>
        <SettingsCard>
          <ToggleRow
            label="Guardado automático"
            description="Guarda tu trabajo automáticamente mientras escribes"
            checked={autoSave}
            onChange={() => updatePreferences({ autoSave: !autoSave })}
          />
          <div style={{ height: 1, backgroundColor: 'var(--dome-border)', margin: '0 16px' }} />
          <ToggleRow
            label="Backup automático"
            description="Crea copias de seguridad de tus datos periódicamente"
            checked={autoBackup}
            onChange={() => updatePreferences({ autoBackup: !autoBackup })}
          />
        </SettingsCard>
      </div>

      {/* ── Citation style ── */}
      <div>
        <SectionLabel>Estilo de citas</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {citationStyles.map((style) => {
            const isActive = citationStyle === style.value;
            return (
              <button
                key={style.value}
                onClick={() => updateCitationStyle(style.value)}
                className="p-3 rounded-xl text-left transition-all"
                style={{
                  backgroundColor: isActive ? `${DOME_GREEN}10` : 'var(--dome-surface)',
                  border: isActive ? `2px solid ${DOME_GREEN}` : '2px solid var(--dome-border)',
                  boxShadow: isActive ? `0 2px 8px ${DOME_GREEN}15` : 'none',
                }}
              >
                <p className="text-sm font-bold mb-0.5" style={{ color: isActive ? DOME_GREEN : 'var(--dome-text)' }}>
                  {style.label}
                </p>
                <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                  {style.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Sync ── */}
      <div>
        <SectionLabel>Datos</SectionLabel>
        <SettingsCard className="p-4 space-y-3">
          <div>
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>Exportar e importar</p>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
              Mueve todos tus datos a otro equipo o crea una copia de seguridad manual.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const r = await window.electron?.sync?.export?.();
                  if (r?.success) alert('Exportación completada en: ' + r.path);
                  else if (!r?.cancelled) alert('Error: ' + (r?.error || 'Unknown'));
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" /> Exportar datos
              </button>
              <button
                onClick={async () => {
                  const r = await window.electron?.sync?.import?.();
                  if (r?.success) {
                    alert(r.restartRequired ? 'Importación completada. Reinicia Dome.' : 'Importación completada.');
                    if (r.restartRequired) window.location.reload();
                  } else if (!r?.cancelled) alert('Error: ' + (r?.error || 'Unknown'));
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: 'var(--dome-bg-hover)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              >
                <Upload className="w-3.5 h-3.5" /> Importar datos
              </button>
            </div>
          </div>
        </SettingsCard>
      </div>

      {/* ── Notes migration ── */}
      {typeof window !== 'undefined' && window.electron?.migration?.getNotesMigrationStatus && (
        <div>
          <SectionLabel>Migración</SectionLabel>
          <SettingsCard className="p-4">
            <p className="text-sm font-medium mb-0.5" style={{ color: 'var(--dome-text)' }}>Migración de notas</p>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>
              Migra notas antiguas al nuevo dominio para habilitar árbol, historial y backlinks.
            </p>
            {notesMigrationStatus && notesMigrationStatus.pendingMigrations > 0 ? (
              <div className="flex items-center gap-3">
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {notesMigrationStatus.pendingMigrations} nota(s) pendiente(s)
                </span>
                <button
                  onClick={handleMigrateNotes}
                  disabled={notesMigrating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: DOME_GREEN }}
                >
                  <FileStack className="w-3.5 h-3.5" />
                  {notesMigrating ? 'Migrando...' : 'Migrar notas'}
                </button>
              </div>
            ) : notesMigrationStatus?.pendingMigrations === 0 ? (
              <span className="flex items-center gap-1.5 text-xs" style={{ color: DOME_GREEN }}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Todas las notas están migradas
              </span>
            ) : null}
          </SettingsCard>
        </div>
      )}
    </div>
  );
}
