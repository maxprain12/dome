import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import type { Resource, TranscriptionSegment } from '@/types';
import {
  getStructuredTranscript,
  getTranscriptPlainTextForCopy,
  getTranscriptionSegmentsForDisplay,
  parseResourceMetadata,
  isTranscriptionCompleted,
  isTranscriptionFailed,
  isTranscriptionProcessing,
} from '@/lib/utils/resource-metadata';
import { useTabStore } from '@/lib/store/useTabStore';
import TranscriptStatusBanner from './transcript/TranscriptStatusBanner';
import TranscriptToolbar from './transcript/TranscriptToolbar';
import TranscriptSearchBar from './transcript/TranscriptSearchBar';
import TranscriptSegmentList from './transcript/TranscriptSegmentList';
import TranscriptEmptyState from './transcript/TranscriptEmptyState';
import { countOccurrences } from './transcript/transcriptUtils';

interface StructuredTranscriptWorkspaceProps {
  resource: Resource;
  mediaLabel: 'audio' | 'video';
  currentTime: number;
  onSeek: (sec: number) => void;
  miniPlayerCollapsed: boolean;
  onToggleMiniPlayer: () => void;
  /** When false, auto-scroll to the active segment is disabled even if “follow playback” is on */
  isPlaying?: boolean;
}

export default function StructuredTranscriptWorkspace({
  resource,
  mediaLabel,
  currentTime,
  onSeek,
  miniPlayerCollapsed,
  onToggleMiniPlayer,
  isPlaying = false,
}: StructuredTranscriptWorkspaceProps) {
  const { t } = useTranslation();
  const meta = parseResourceMetadata(resource);
  const structured = getStructuredTranscript(meta);
  const segments = getTranscriptionSegmentsForDisplay(meta);
  const speakersMap = structured?.speakers ?? {};
  const noteId = meta.transcription_note_id;
  const hasPlain = Boolean(meta.transcription?.trim());
  const completed = isTranscriptionCompleted(meta);
  const metaProcessing = isTranscriptionProcessing(meta);
  const metaFailed = isTranscriptionFailed(meta);
  const [transcribing, setTranscribing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [localSpeakerLabels, setLocalSpeakerLabels] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [followPlayback, setFollowPlayback] = useState(true);

  const rowRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const k of Object.keys(speakersMap)) {
      const lab = speakersMap[k]?.label;
      if (lab) next[k] = lab;
    }
    setLocalSpeakerLabels((prev) => ({ ...next, ...prev }));
  }, [resource.id, structured?.segments?.length, JSON.stringify(Object.keys(speakersMap))]);

  const activeSegmentId = useMemo(() => {
    let best: TranscriptionSegment | null = null;
    for (const seg of segments) {
      if (seg.startTime <= currentTime + 0.12) {
        if (!best || seg.startTime >= best.startTime) best = seg;
      }
    }
    return best?.id ?? null;
  }, [segments, currentTime]);

  useEffect(() => {
    if (!followPlayback || !isPlaying) return;
    if (!activeSegmentId) return;
    const el = rowRefs.current.get(activeSegmentId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeSegmentId, followPlayback, isPlaying]);

  const uniqueSpeakerIds = useMemo(() => {
    const s = new Set<string>();
    for (const seg of segments) s.add(seg.speakerId);
    return [...s];
  }, [segments]);

  const matchCount = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return 0;
    let n = 0;
    for (const seg of segments) {
      n += countOccurrences(String(seg.text || ''), q);
    }
    return n;
  }, [segments, searchQuery]);

  const sessionLine = useMemo(() => {
    if (!structured?.session) return null;
    const { captureKind, callPlatform } = structured.session;
    if (captureKind === 'file' && callPlatform === 'unknown') return null;
    const cap =
      captureKind === 'microphone'
        ? t('media.capture_mic')
        : captureKind === 'system'
          ? t('media.capture_system')
          : captureKind === 'call'
            ? t('media.capture_call')
            : t('media.capture_file');
    const platformKeyMap: Record<string, string> = {
      teams: 'media.platform_teams',
      slack: 'media.platform_slack',
      discord: 'media.platform_discord',
      meet: 'media.platform_meet',
      zoom: 'media.platform_zoom',
      webex: 'media.platform_webex',
      unknown: 'media.platform_unknown',
    };
    const plat =
      callPlatform && callPlatform !== 'unknown'
        ? t((platformKeyMap[callPlatform] ?? 'media.platform_unknown') as 'media.platform_teams')
        : '';
    return plat ? `${cap} · ${plat}` : cap;
  }, [structured?.session, t]);

  const openLinkedNote = useCallback(() => {
    if (!noteId) return;
    useTabStore.getState().openNoteTab(noteId, t('media.transcription_note_tab'));
  }, [noteId, t]);

  const openTranscriptionSettings = useCallback(() => {
    useTabStore.getState().openSettingsTab();
    window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'transcription' }));
  }, []);

  const handleCopyTranscript = useCallback(async () => {
    const text = getTranscriptPlainTextForCopy(meta);
    if (!text) {
      notifications.show({ message: t('media.transcript_copy_empty'), color: 'gray' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ message: t('media.transcript_copied'), color: 'green' });
    } catch {
      notifications.show({ message: t('media.transcript_copy_failed'), color: 'red' });
    }
  }, [meta, t]);

  const handleTranscribe = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.transcription?.resourceToNote) return;
    setTranscribing(true);
    try {
      const result = await window.electron.transcription.resourceToNote({
        resourceId: resource.id,
        updateAudioMetadata: true,
      });
      if (result.success && result.note) {
        notifications.show({
          title: t('media.transcription_done_title'),
          message: t('media.transcription_done_message', { title: result.note.title }),
          color: 'green',
        });
      } else {
        notifications.show({
          title: t('media.transcription_failed_title'),
          message: result.error || t('media.transcription_unknown_error'),
          color: 'red',
        });
      }
    } catch (e) {
      notifications.show({
        title: t('media.transcription_failed_title'),
        message: e instanceof Error ? e.message : t('media.transcription_unknown_error'),
        color: 'red',
      });
    } finally {
      setTranscribing(false);
    }
  }, [resource.id, t]);

  const handleRegenerateNote = useCallback(async () => {
    if (!window.electron?.transcription?.regenerateLinkedNote) return;
    setRegenerating(true);
    try {
      const res = await window.electron.transcription.regenerateLinkedNote({ resourceId: resource.id });
      if (res.success) {
        notifications.show({
          title: t('media.regenerate_note_done'),
          message: t('media.regenerate_note_done'),
          color: 'green',
        });
      } else {
        notifications.show({
          title: t('media.regenerate_note_failed'),
          message: res.error || '',
          color: 'red',
        });
      }
    } catch (e) {
      notifications.show({
        title: t('media.regenerate_note_failed'),
        message: e instanceof Error ? e.message : '',
        color: 'red',
      });
    } finally {
      setRegenerating(false);
    }
  }, [resource.id, t]);

  const flushSpeakerRename = useCallback(
    async (speakerId: string, rawLabel: string) => {
      const label = rawLabel.trim();
      if (!label || !window.electron?.transcription?.patchTranscriptSpeakers) return;
      const prev = speakersMap[speakerId]?.label ?? '';
      if (label === prev) return;
      const res = await window.electron.transcription.patchTranscriptSpeakers({
        resourceId: resource.id,
        speakersPatch: { [speakerId]: { label } },
      });
      if (!res.success) {
        notifications.show({
          title: t('media.speaker_rename_failed'),
          message: res.error,
          color: 'red',
        });
      }
    },
    [resource.id, speakersMap, t],
  );

  const showEmpty = !segments.length && !hasPlain && !completed;
  const canCopy = Boolean(getTranscriptPlainTextForCopy(meta));

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--dome-bg)' }}>
      <TranscriptStatusBanner
        t={t}
        transcribing={transcribing}
        metaProcessing={metaProcessing}
        metaFailed={metaFailed}
      />
      <TranscriptToolbar
        t={t}
        resourceTitle={resource.title}
        mediaLabel={mediaLabel}
        sessionLine={sessionLine}
        diarizationHeuristicBadge={structured?.diarization === 'heuristic'}
        miniPlayerCollapsed={miniPlayerCollapsed}
        onToggleMiniPlayer={onToggleMiniPlayer}
        noteId={noteId}
        onRegenerateNote={() => void handleRegenerateNote()}
        regenerating={regenerating}
        hasStructured={Boolean(structured)}
        onOpenNote={openLinkedNote}
        onTranscribe={() => void handleTranscribe()}
        transcribing={transcribing}
        onCopyTranscript={() => void handleCopyTranscript()}
        canCopy={canCopy}
        onOpenTranscriptionSettings={openTranscriptionSettings}
        followPlayback={followPlayback}
        onFollowPlaybackChange={setFollowPlayback}
        isPlaying={isPlaying}
      />

      {!showEmpty ? (
        <div
          className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-2 md:px-6"
          style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          <TranscriptSearchBar
            t={t}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            matchCount={matchCount}
            totalSegments={segments.length}
          />
          
          {structured && uniqueSpeakerIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              {uniqueSpeakerIds.map((sid) => (
                <label key={sid} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                  <span className="font-medium">{t('media.speaker')}:</span>
                  <input
                    value={localSpeakerLabels[sid] ?? (speakersMap[sid]?.label || sid)}
                    onChange={(e) =>
                      setLocalSpeakerLabels((prev) => ({
                        ...prev,
                        [sid]: e.target.value,
                      }))
                    }
                    onBlur={(e) => void flushSpeakerRename(sid, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-24 rounded border px-2 py-1 text-xs outline-none transition-colors focus:border-[var(--dome-accent)] focus:ring-1 focus:ring-[var(--dome-accent)]"
                    style={{
                      borderColor: 'var(--dome-border)',
                      background: 'var(--dome-bg)',
                      color: 'var(--dome-text)',
                    }}
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        {showEmpty ? (
          <TranscriptEmptyState t={t} hint={t('media.transcript_empty_hint')} />
        ) : (
          <TranscriptSegmentList
            t={t}
            segments={segments}
            speakersMap={speakersMap}
            currentTime={currentTime}
            onSeek={onSeek}
            activeSegmentId={activeSegmentId}
            searchQuery={searchQuery}
            rowRefs={rowRefs}
          />
        )}
      </div>
    </div>
  );
}
