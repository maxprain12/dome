import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTranscriptionStore } from '@/lib/transcription/useTranscriptionStore';

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
        right: Math.round(window.innerWidth - rect.right),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
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
      if (anchor && anchor.contains(e.target as Node)) return;
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
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('transcriptions.live_preview_title', 'Live transcript')}
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        zIndex: 9998,
        width: 460,
        maxHeight: 320,
        background: 'var(--dome-bg, #fff)',
        border: '1px solid var(--dome-border, #dcdce8)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
        animation: 'dropdown-appear 0.15s ease-out',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dome-text)' }}>
          {t('transcriptions.live_preview_title', 'Live transcript')}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="px-3 py-3 overflow-y-auto"
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: showPlaceholder ? 'var(--dome-text-muted)' : 'var(--dome-text)',
          flex: 1,
        }}
      >
        {showPlaceholder
          ? t('transcriptions.state_no_partial', 'Live transcript will appear here…')
          : partialText || ''}
      </div>
    </div>
  );
}
