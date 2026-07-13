import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, ComputerIcon, Mic01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
import { useTranscriptionStore, type TranscriptionSource } from '@/lib/transcription/useTranscriptionStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldLabel } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  const wantsSystem = sources.includes('system');

  const loadSources = useCallback(async () => {
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

  const toggleSource = (s: TranscriptionSource) => {
    const adding = !sources.includes(s);
    setSources((prev) => {
      if (prev.includes(s)) return prev.filter((x) => x !== s);
      return [...prev, s];
    });
    if (adding && s === 'system') void loadSources();
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
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverTrigger render={<span className="fixed size-px" style={{ top: position.top, right: position.right }} aria-hidden />} />
      <PopoverContent align="end" side="bottom" sideOffset={0} className="transcription-start-popover w-[360px]">
      <PopoverHeader className="flex-row items-center justify-between">
        <PopoverTitle>{t('transcriptions.start_title', 'New transcription')}</PopoverTitle>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close', 'Close')}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </PopoverHeader>

      {/* Sources */}
      <Field>
        <FieldLabel>{t('transcriptions.start_sources_label', 'Capture')}</FieldLabel>
        <ToggleGroup variant="outline" className="grid w-full grid-cols-2">
          <ToggleGroupItem pressed={sources.includes('mic')} onPressedChange={() => toggleSource('mic')} aria-label={t('transcriptions.start_source_mic', 'Microphone')}>
            <HugeiconsIcon icon={Mic01Icon} data-icon="inline-start" />
            {t('transcriptions.start_source_mic', 'Microphone')}
          </ToggleGroupItem>
          <ToggleGroupItem pressed={sources.includes('system')} onPressedChange={() => toggleSource('system')} aria-label={t('transcriptions.start_source_system', 'System audio')}>
            <HugeiconsIcon icon={ComputerIcon} data-icon="inline-start" />
            {t('transcriptions.start_source_system', 'System audio')}
          </ToggleGroupItem>
        </ToggleGroup>
      </Field>

      {/* System source picker */}
      {wantsSystem && (
        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>
              {t('transcriptions.start_pick_screen', 'Pick a window or screen')}
            </FieldLabel>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadSources()}
              disabled={loadingSources}
              aria-label={t('transcriptions.refresh_sources', 'Refresh')}
            >
              {loadingSources ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}
            </Button>
          </div>
          <ScrollArea className="h-[170px]">
          <div className="grid grid-cols-2 gap-2 pr-2">
            {captureSources.map((src) => (
              <Button
                key={src.id}
                type="button"
                variant={systemSourceId === src.id ? 'secondary' : 'outline'}
                onClick={() => setSystemSourceId(src.id)}
                aria-pressed={systemSourceId === src.id}
                className="h-auto min-w-0 flex-col items-stretch overflow-hidden p-0 text-left"
              >
                {src.thumbnailDataUrl ? (
                  <img src={src.thumbnailDataUrl} alt="" className="h-16 w-full object-cover" />
                ) : (
                  <span className="h-16 w-full bg-muted" aria-hidden />
                )}
                <span className="w-full truncate px-2 py-1.5 text-xs">
                  {src.name}
                </span>
              </Button>
            ))}
            {!loadingSources && captureSources.length === 0 && (
              <p className="col-span-2 p-2 text-xs text-muted-foreground">
                {t('transcriptions.no_capture_sources', 'No sources detected')}
              </p>
            )}
          </div>
          </ScrollArea>
        </Field>
      )}

      {/* Options */}
      <Field>
        <FieldLabel>{t('transcriptions.start_options_label', 'Options')}</FieldLabel>
        <div className="flex flex-col gap-2">
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
      </Field>

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      <Button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className="transcription-start-btn w-full"
      >
        {submitting ? <Spinner data-icon="inline-start" /> : null}
        {submitting ? t('transcriptions.starting', 'Starting…') : t('transcriptions.start_button', 'Start')}
      </Button>
      </PopoverContent>
    </Popover>
  );
}

function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field orientation="horizontal" className="rounded-xl border p-3">
      <FieldLabel className="flex-1">{label}</FieldLabel>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </Field>
  );
}
