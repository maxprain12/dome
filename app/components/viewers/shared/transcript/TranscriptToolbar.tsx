import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, Copy01Icon, ExternalLinkIcon, File02Icon, RefreshIcon, Settings01Icon } from '@hugeicons/core-free-icons';
import type { TFunction } from 'i18next';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import Toolbar from '@/components/shared/Toolbar';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
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
    <Toolbar className="!px-4 !py-3 md:!px-6 !border-border !bg-transparent">
      <Toolbar.Leading>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{resourceTitle}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="secondary"><span className="truncate">{mediaLabel === 'audio' ? t('media.media_type_audio') : t('media.media_type_video')}</span></Badge>
            {sessionLine ? <span>{sessionLine}</span> : null}
            {diarizationHeuristicBadge ? (
              <span title={t('media.diarization_heuristic_hint')}>{t('media.diarization_heuristic_badge')}</span>
            ) : null}
          </div>
        </div>
      </Toolbar.Leading>
      <Toolbar.Trailing>
        <div className="flex flex-wrap items-center gap-1.5 justify-end">
          <div className="inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent transition-colors">
            <Switch size="sm" checked={followPlayback} onCheckedChange={onFollowPlaybackChange} />
            <span
              className="text-[11px] font-medium text-muted-foreground inline-flex items-center gap-1.5"
              title={t('media.transcript_follow_playback_hint')}
            >
              {t('media.transcript_follow_playback')}
              {isPlaying ? (
                <span
                  className="size-1.5 animate-pulse rounded-full shrink-0 bg-primary motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
            </span>
          </div>

          <Separator
            orientation="vertical"
            className="mx-1 h-4 min-h-4 self-center"
          />

          <Button type="button"
  variant="ghost"
  onClick={onCopyTranscript}
  disabled={!canCopy}
  title={t('media.transcript_copy')}
  aria-label={t('media.transcript_copy')}
  size="icon-sm">
            <HugeiconsIcon icon={Copy01Icon} aria-hidden />
          </Button>

          <Button type="button"
  variant="ghost"
  onClick={onOpenTranscriptionSettings}
  title={t('media.transcript_open_settings')}
  aria-label={t('media.transcript_open_settings')}
  size="icon-sm">
            <HugeiconsIcon icon={Settings01Icon} aria-hidden />
          </Button>

          <Button type="button"
  variant="ghost"
  onClick={onToggleMiniPlayer}
  title={miniPlayerCollapsed ? t('media.show_mini_player') : t('media.hide_mini_player')}
  aria-label={miniPlayerCollapsed ? t('media.show_mini_player') : t('media.hide_mini_player')}
  size="icon-sm">
            {miniPlayerCollapsed ? (
              <HugeiconsIcon icon={ArrowUp01Icon} aria-hidden />
            ) : (
              <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden />
            )}
          </Button>

          {noteId ? (
            <>
              <Button type="button"
  variant="ghost"
  onClick={onRegenerateNote}
  disabled={regenerating || !hasStructured}
  title={t('media.regenerate_linked_note')}
  aria-label={t('media.regenerate_linked_note')}
  size="icon-sm">
                {regenerating ? (
                  <Spinner aria-hidden />
                ) : (
                  <HugeiconsIcon icon={RefreshIcon} aria-hidden />
                )}
              </Button>
              <Button type="button"
  onClick={onOpenNote}
  className="ml-1"
  size="sm"><HugeiconsIcon icon={ExternalLinkIcon} data-icon="inline-start" aria-hidden />
                {t('media.open_linked_note')}
              </Button>
            </>
          ) : (
            <Button type="button"
  variant="outline"
  onClick={onTranscribe}
  disabled={transcribing}
  className="ml-1"
  size="sm">{
                transcribing ? (
                  <Spinner data-icon="inline-start" aria-hidden />
                ) : (
                  <HugeiconsIcon icon={File02Icon} data-icon="inline-start" aria-hidden />
                )
              }
              {transcribing ? t('media.transcribing') : t('media.transcribe_to_note')}
            </Button>
          )}
        </div>
      </Toolbar.Trailing>
    </Toolbar>
  );
}
