import {
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Settings,
} from 'lucide-react';
import type { TFunction } from 'i18next';

interface TranscriptToolbarProps {
  t: TFunction;
  resourceTitle: string;
  mediaLabel: 'audio' | 'video';
  sessionLine: string | null;
  diarizationHeuristicBadge: boolean;
  miniPlayerCollapsed: boolean;
  onToggleMiniPlayer: () => void;
  noteId: string | undefined;
  onRegenerateNote: () => void;
  regenerating: boolean;
  hasStructured: boolean;
  onOpenNote: () => void;
  onTranscribe: () => void;
  transcribing: boolean;
  onCopyTranscript: () => void;
  canCopy: boolean;
  onOpenTranscriptionSettings: () => void;
  followPlayback: boolean;
  onFollowPlaybackChange: (next: boolean) => void;
  isPlaying: boolean;
}

export default function TranscriptToolbar({
  t,
  resourceTitle,
  mediaLabel,
  sessionLine,
  diarizationHeuristicBadge,
  miniPlayerCollapsed,
  onToggleMiniPlayer,
  noteId,
  onRegenerateNote,
  regenerating,
  hasStructured,
  onOpenNote,
  onTranscribe,
  transcribing,
  onCopyTranscript,
  canCopy,
  onOpenTranscriptionSettings,
  followPlayback,
  onFollowPlaybackChange,
  isPlaying,
}: TranscriptToolbarProps) {
  return (
    <div className="border-b px-4 py-3 md:px-6" style={{ borderColor: 'var(--dome-border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight" style={{ color: 'var(--dome-text)' }}>
            {resourceTitle}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
            <span
              className="rounded px-2 py-0.5 font-semibold uppercase tracking-wide"
              style={{ background: 'var(--dome-bg-hover)' }}
            >
              {mediaLabel === 'audio' ? t('media.media_type_audio') : t('media.media_type_video')}
            </span>
            {sessionLine ? <span>{sessionLine}</span> : null}
            {diarizationHeuristicBadge ? (
              <span title={t('media.diarization_heuristic_hint')}>{t('media.diarization_heuristic_badge')}</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="inline-flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded-lg hover:bg-[var(--dome-bg-hover)] transition-colors" style={{ color: 'var(--dome-text-muted)' }}>
            <input
              type="checkbox"
              className="rounded border"
              style={{ borderColor: 'var(--dome-border)' }}
              checked={followPlayback}
              onChange={(e) => onFollowPlaybackChange(e.target.checked)}
            />
            <span title={t('media.transcript_follow_playback_hint')}>{t('media.transcript_follow_playback')}</span>
            {isPlaying ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--dome-accent)' }} />
            ) : null}
          </label>

          <div className="mx-1 h-4 w-px bg-[var(--dome-border)] opacity-50" />

          <button
            type="button"
            onClick={onCopyTranscript}
            disabled={!canCopy}
            title={t('media.transcript_copy')}
            className="rounded-lg p-1.5 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)] disabled:opacity-50 transition-colors"
          >
            <Copy className="h-4 w-4" aria-hidden />
          </button>
          
          <button
            type="button"
            onClick={onOpenTranscriptionSettings}
            title={t('media.transcript_open_settings')}
            className="rounded-lg p-1.5 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)] transition-colors"
          >
            <Settings className="h-4 w-4" aria-hidden />
          </button>
          
          <button
            type="button"
            onClick={onToggleMiniPlayer}
            title={miniPlayerCollapsed ? t('media.show_mini_player') : t('media.hide_mini_player')}
            className="rounded-lg p-1.5 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)] transition-colors"
          >
            {miniPlayerCollapsed ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </button>

          {noteId ? (
            <>
              <button
                type="button"
                onClick={onRegenerateNote}
                disabled={regenerating || !hasStructured}
                title={t('media.regenerate_linked_note')}
                className="rounded-lg p-1.5 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)] disabled:opacity-50 transition-colors"
              >
                {regenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={onOpenNote}
                className="ml-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                {t('media.open_linked_note')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onTranscribe}
              disabled={transcribing}
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 hover:bg-[var(--dome-bg-hover)]"
              style={{
                borderColor: 'var(--dome-border)',
                background: 'var(--dome-surface)',
                color: 'var(--dome-text)',
              }}
            >
              {transcribing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <FileText className="h-3.5 w-3.5" aria-hidden />
              )}
              {transcribing ? t('media.transcribing') : t('media.transcribe_to_note')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
