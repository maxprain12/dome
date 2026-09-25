import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';
import { transcriptionErrorMessage } from '@/lib/transcription/errors';
import { cn } from '@/lib/utils';

interface Props {
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}

interface PanelPosition {
  top: number;
  right: number;
}

export default function LivePreviewPanel({ anchorRef, onClose }: Props) {
  const { t } = useTranslation();
  const partialText = useTranscriptionStore((s) => s.partialText);
  const phase = useTranscriptionStore((s) => s.phase);
  const livePreview = useTranscriptionStore((s) => s.livePreview);
  const liveEngine = useTranscriptionStore((s) => s.liveEngine);
  const notice = useTranscriptionStore((s) => s.notice);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);

  // Track the anchor's position so the panel sticks below it.
  useEffect(() => {
    const update = () => {
      const a = anchorRef.current;
      if (!a) return;
      const rect = a.getBoundingClientRect();
      setPosition({
        top: Math.round(rect.bottom + 6),
        right: Math.round(globalThis.innerWidth - rect.right),
      });
    };
    update();
    globalThis.addEventListener('resize', update);
    globalThis.addEventListener('scroll', update, true);
    return () => {
      globalThis.removeEventListener('resize', update);
      globalThis.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  // Auto-scroll to bottom when text grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [partialText]);

  // Click-outside / Esc to close.
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const root = containerRef.current;
      const anchor = anchorRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      if (anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  if (!position) return null;

  const showPlaceholder = !partialText && livePreview && phase === 'recording';

  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverTrigger render={<span className="fixed size-px" style={{ top: position.top, right: position.right }} aria-hidden />} />
      <PopoverContent ref={containerRef} align="end" side="bottom" sideOffset={0} className="live-preview-panel flex max-h-80 w-[460px] flex-col gap-0 rounded-xl border border-border bg-background p-0 shadow-lg">
        <PopoverTitle className="sr-only">{t('transcriptions.live_preview_title')}</PopoverTitle>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs font-semibold text-foreground">{t('transcriptions.live_preview_title')}</span>
          {liveEngine ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {liveEngine === 'realtime' ? t('transcriptions.live_engine_realtime') : t('transcriptions.live_engine_chunks')}
            </Badge>
          ) : null}
        </div>
        {notice ? (
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">{transcriptionErrorMessage(t, notice)}</p>
        ) : null}
        <div
          ref={scrollRef}
          aria-live="polite"
          className={cn(
            'flex-1 overflow-y-auto p-3 text-[13px] leading-normal',
            showPlaceholder ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {showPlaceholder ? t('transcriptions.state_no_partial') : partialText}
        </div>
      </PopoverContent>
    </Popover>
  );
}
