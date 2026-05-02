import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mic, Monitor, X, RefreshCw } from 'lucide-react';
import { useTranscriptionStore, type TranscriptionSource } from '@/lib/transcription/useTranscriptionStore';
import { useAppStore } from '@/lib/store/useAppStore';

interface Props {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}

interface CaptureSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnailDataUrl: string;
  iconDataUrl?: string;
}

export default function StartTranscriptionPopover({ anchorRef, onClose }: Props) {
  const { t } = useTranslation();
  const settings = useTranscriptionStore((s) => s.settings);
  const start = useTranscriptionStore((s) => s.start);
  const currentProject = useAppStore((s) => s.currentProject);

  const [sources, setSources] = useState<TranscriptionSource[]>(() => settings?.defaultSources?.length
    ? settings.defaultSources
    : ['mic']);
  const [livePreview, setLivePreview] = useState<boolean>(() => settings?.liveTranscriptDefault ?? true);
  const [saveAudio, setSaveAudio] = useState<boolean>(true);
  const [systemSourceId, setSystemSourceId] = useState<string | null>(null);
  const [captureSources, setCaptureSources] = useState<CaptureSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  // Position relative to anchor (right-aligned, just below the topbar)
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition({
      top: Math.round(rect.bottom + 6),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, [anchorRef]);

  // Click-outside / Esc to close
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const root = containerRef.current;
      const anchor = anchorRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const wantsSystem = sources.includes('system');

  const loadSources = useMemo(() => async () => {
    setLoadingSources(true);
    setError(null);
    try {
      const res = await window.electron?.transcription?.listCaptureSources();
      if (res?.success && Array.isArray(res.sources)) {
        setCaptureSources(res.sources);
      } else {
        setError(res?.error || t('transcriptions.start_pick_screen_error', 'Could not load capture sources'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingSources(false);
    }
  }, [t]);

  useEffect(() => {
    if (wantsSystem && captureSources.length === 0 && !loadingSources) void loadSources();
  }, [wantsSystem, captureSources.length, loadingSources, loadSources]);

  const toggleSource = (s: TranscriptionSource) => {
    setSources((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      return [...prev, s];
    });
  };

  const canStart = sources.length > 0 && (!wantsSystem || !!systemSourceId) && !submitting;

  const handleStart = async () => {
    if (!canStart) return;
    setSubmitting(true);
    setError(null);
    const result = await start({
      sources,
      systemSourceId: systemSourceId || undefined,
      livePreview,
      saveAudio,
      projectId: currentProject?.id,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error || t('transcriptions.start_failed', 'Failed to start'));
      return;
    }
    onClose();
  };

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('transcriptions.start_title', 'New transcription')}
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        width: 360,
        zIndex: 9999,
        background: 'var(--dome-bg, #fff)',
        border: '1px solid var(--dome-border, #dcdce8)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        padding: 14,
        animation: 'dropdown-appear 0.15s ease-out',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--dome-text)' }}>
          {t('transcriptions.start_title', 'New transcription')}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
          className="p-1 rounded hover:bg-[var(--dome-bg-hover)]"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Sources */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dome-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {t('transcriptions.start_sources_label', 'Capture')}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <SourceChip
          icon={<Mic size={14} />}
          label={t('transcriptions.start_source_mic', 'Microphone')}
          active={sources.includes('mic')}
          onClick={() => toggleSource('mic')}
        />
        <SourceChip
          icon={<Monitor size={14} />}
          label={t('transcriptions.start_source_system', 'System audio')}
          active={sources.includes('system')}
          onClick={() => toggleSource('system')}
        />
      </div>

      {/* System source picker */}
      {wantsSystem && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
              {t('transcriptions.start_pick_screen', 'Pick a window or screen')}
            </span>
            <button
              type="button"
              onClick={() => void loadSources()}
              disabled={loadingSources}
              aria-label={t('transcriptions.refresh_sources', 'Refresh')}
              className="p-1 rounded hover:bg-[var(--dome-bg-hover)]"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <RefreshCw size={12} className={loadingSources ? 'animate-spin' : ''} />
            </button>
          </div>
          <div
            className="grid grid-cols-2 gap-1.5 overflow-y-auto"
            style={{ maxHeight: 170 }}
          >
            {captureSources.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setSystemSourceId(src.id)}
                className="flex flex-col items-stretch text-left rounded-md overflow-hidden border transition-all"
                style={{
                  borderColor: systemSourceId === src.id ? 'var(--dome-accent)' : 'var(--dome-border)',
                  background: systemSourceId === src.id ? 'color-mix(in srgb, var(--dome-accent) 8%, transparent)' : 'var(--dome-bg-secondary)',
                }}
              >
                {src.thumbnailDataUrl ? (
                  <img src={src.thumbnailDataUrl} alt="" style={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }} />
                ) : (
                  <div style={{ width: '100%', height: 60, background: 'var(--dome-bg-tertiary)' }} />
                )}
                <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--dome-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {src.name}
                </div>
              </button>
            ))}
            {!loadingSources && captureSources.length === 0 && (
              <div className="col-span-2" style={{ fontSize: 11, color: 'var(--dome-text-muted)', padding: 8 }}>
                {t('transcriptions.no_capture_sources', 'No sources detected')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Options */}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--dome-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {t('transcriptions.start_options_label', 'Options')}
      </div>
      <div className="flex flex-col gap-1.5 mb-3">
        <ToggleRow
          label={t('transcriptions.start_live_preview', 'Live preview')}
          checked={livePreview}
          onChange={setLivePreview}
        />
        <ToggleRow
          label={t('transcriptions.start_save_audio', 'Save audio file')}
          checked={saveAudio}
          onChange={setSaveAudio}
        />
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--dome-danger, #d23434)',
            background: 'color-mix(in srgb, var(--dome-danger, #d23434) 8%, transparent)',
            padding: '6px 8px',
            borderRadius: 6,
            marginBottom: 8,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: 13,
          fontWeight: 600,
          color: 'white',
          background: canStart ? 'var(--dome-accent)' : 'var(--dome-bg-tertiary)',
          border: 'none',
          borderRadius: 8,
          cursor: canStart ? 'pointer' : 'not-allowed',
          transition: 'filter 150ms ease',
        }}
      >
        {submitting ? t('transcriptions.starting', 'Starting…') : t('transcriptions.start_button', 'Start')}
      </button>
    </div>
  );
}

function SourceChip({
  icon, label, active, onClick,
}: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-2 px-3 py-2 rounded-md transition-all"
      style={{
        background: active
          ? 'color-mix(in srgb, var(--dome-accent) 12%, transparent)'
          : 'var(--dome-bg-secondary)',
        border: `1px solid ${active ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
        color: active ? 'var(--dome-accent)' : 'var(--dome-text)',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className="flex items-center justify-between cursor-pointer rounded-md px-2 py-1.5"
      style={{
        background: 'var(--dome-bg-secondary)',
        border: '1px solid var(--dome-border)',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--dome-text)' }}>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--dome-accent)' }}
      />
    </label>
  );
}
