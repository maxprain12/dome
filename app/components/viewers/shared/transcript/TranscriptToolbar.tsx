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
import DomeToolbar from '@/components/ui/DomeToolbar';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeDivider from '@/components/ui/DomeDivider';

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
  const iconBtn =
    'rounded-lg !p-1.5 min-w-0 text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg-hover)] hover:text-[var(--dome-text)]';

  return (
    <DomeToolbar
      className="!px-4 !py-3 md:!px-6 !border-[var(--dome-border)] !bg-transparent"
      leading={
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-[var(--dome-text)]">{resourceTitle}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--dome-text-muted)]">
            <DomeBadge
              label={mediaLabel === 'audio' ? t('media.media_type_audio') : t('media.media_type_video')}
              variant="soft"
              size="xs"
              color="var(--dome-text-muted)"
              className="!rounded !uppercase !tracking-wide !font-semibold !bg-[var(--dome-bg-hover)]"
            />
            {sessionLine ? <span>{sessionLine}</span> : null}
            {diarizationHeuristicBadge ? (
              <span title={t('media.diarization_heuristic_hint')}>{t('media.diarization_heuristic_badge')}</span>
            ) : null}
          </div>
        </div>
      }
      trailing={
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          <div className="inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-[var(--dome-bg-hover)] transition-colors">
            <DomeToggle size="sm" checked={followPlayback} onChange={onFollowPlaybackChange} />
            <span
              className="text-[11px] font-medium text-[var(--dome-text-muted)] inline-flex items-center gap-1.5"
              title={t('media.transcript_follow_playback_hint')}
            >
              {t('media.transcript_follow_playback')}
              {isPlaying ? (
                <span
                  className="h-1.5 w-1.5 animate-pulse rounded-full shrink-0"
                  style={{ background: 'var(--dome-accent)' }}
                  aria-hidden
                />
              ) : null}
            </span>
          </div>

          <DomeDivider
            orientation="vertical"
            spacingClass="mx-1"
            className="h-4 min-h-[16px] opacity-50 self-center bg-[var(--dome-border)]"
          />

          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onCopyTranscript}
            disabled={!canCopy}
            title={t('media.transcript_copy')}
            aria-label={t('media.transcript_copy')}
            className={`${iconBtn} disabled:opacity-50`}
          >
            <Copy className="h-4 w-4" aria-hidden />
          </DomeButton>

          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onOpenTranscriptionSettings}
            title={t('media.transcript_open_settings')}
            aria-label={t('media.transcript_open_settings')}
            className={iconBtn}
          >
            <Settings className="h-4 w-4" aria-hidden />
          </DomeButton>

          <DomeButton
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onToggleMiniPlayer}
            title={miniPlayerCollapsed ? t('media.show_mini_player') : t('media.hide_mini_player')}
            aria-label={miniPlayerCollapsed ? t('media.show_mini_player') : t('media.hide_mini_player')}
            className={iconBtn}
          >
            {miniPlayerCollapsed ? (
              <ChevronUp className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden />
            )}
          </DomeButton>

          {noteId ? (
            <>
              <DomeButton
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={onRegenerateNote}
                disabled={regenerating || !hasStructured}
                title={t('media.regenerate_linked_note')}
                aria-label={t('media.regenerate_linked_note')}
                className={`${iconBtn} disabled:opacity-50`}
              >
                {regenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="h-4 w-4" aria-hidden />
                )}
              </DomeButton>
              <DomeButton
                type="button"
                variant="primary"
                size="sm"
                onClick={onOpenNote}
                className="ml-1 gap-1.5 !rounded-lg !px-3 !py-1.5 !text-xs !h-auto min-h-0 !bg-[var(--dome-accent)] !text-[var(--dome-on-accent,#fff)]"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
              >
                {t('media.open_linked_note')}
              </DomeButton>
            </>
          ) : (
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={onTranscribe}
              disabled={transcribing}
              className="ml-1 gap-1.5 !rounded-lg !px-3 !py-1.5 !text-xs !h-auto min-h-0 border-[var(--dome-border)] bg-[var(--dome-surface)] text-[var(--dome-text)] hover:bg-[var(--dome-bg-hover)] disabled:opacity-50"
              leftIcon={
                transcribing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                )
              }
            >
              {transcribing ? t('media.transcribing') : t('media.transcribe_to_note')}
            </DomeButton>
          )}
        </div>
      }
    />
  );
}
