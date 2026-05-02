import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import DomeButton from '@/components/ui/DomeButton';
import { useTabStore } from '@/lib/store/useTabStore';
import { downloadTextFile, structuredToMarkdown, structuredToSrt } from '@/lib/transcription/export';
import type { TranscriptStructured } from '@/lib/transcription/export';
import type { Resource } from '@/types';

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function TranscriptionDetailPage({ noteId }: { noteId: string }) {
  // Note: the prop is named `noteId` for legacy compatibility — it is actually a
  // generic resource id (audio with metadata.kind = 'transcription' for new
  // recordings, or a legacy 'note' resource for older data).
  const resourceId = noteId;
  const { t } = useTranslation();
  const openNoteTab = useTabStore((s) => s.openNoteTab);
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);

  const load = useCallback(async () => {
    if (!resourceId || !window.electron?.db?.resources?.getById) {
      setResource(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electron.db.resources.getById(resourceId);
      if (res.success && res.data) setResource(res.data);
      else setResource(null);
    } catch {
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on('resource:updated', (payload: { id?: string }) => {
      if (payload?.id === resourceId) void load();
    });
    return () => unsub?.();
  }, [load, resourceId]);

  const meta = useMemo(() => (resource ? parseMeta(resource.metadata) : {}), [resource]);
  const structured = meta.transcription_structured as TranscriptStructured | undefined;
  const transcriptText = typeof meta.transcription === 'string' ? meta.transcription : '';
  const linkedNoteId = typeof meta.transcription_note_id === 'string' ? meta.transcription_note_id : '';
  const isAudioTranscription = resource?.type === 'audio' && meta.kind === 'transcription';

  const onConvertToNote = async () => {
    if (!resource) return;
    setConverting(true);
    try {
      const res = await window.electron?.transcription?.resourceToNote({ resourceId: resource.id });
      if (res?.success && res.note) {
        notifications.show({
          title: t('transcriptions.detail_convert_to_note', 'Convert to note'),
          message: res.note.title || '',
          color: 'green',
        });
        openNoteTab(res.note.id, res.note.title || '');
        void load();
      } else {
        notifications.show({ title: t('common.error'), message: res?.error || '', color: 'red' });
      }
    } catch (e) {
      notifications.show({
        title: t('common.error'),
        message: e instanceof Error ? e.message : '',
        color: 'red',
      });
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--dome-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {t('common.loading')}
        </p>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: 'var(--dome-bg)' }}>
        <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {t('common.noResourceSelected')}
        </p>
      </div>
    );
  }

  const md = structured ? structuredToMarkdown(structured) : transcriptText;
  const srt = structured ? structuredToSrt(structured) : '';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4" style={{ background: 'var(--dome-bg)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
          {resource.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          {isAudioTranscription && linkedNoteId && (
            <DomeButton type="button" size="sm" variant="outline" onClick={() => openNoteTab(linkedNoteId, resource.title || '')}>
              {t('transcriptions.open_note', 'Open note')}
            </DomeButton>
          )}
          {isAudioTranscription && !linkedNoteId && (
            <DomeButton
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onConvertToNote()}
              disabled={converting || !transcriptText}
            >
              {converting ? t('common.loading') : t('transcriptions.detail_convert_to_note', 'Convert to note')}
            </DomeButton>
          )}
          {!isAudioTranscription && resource.type === 'note' && (
            <DomeButton type="button" size="sm" variant="outline" onClick={() => openNoteTab(resource.id, resource.title || '')}>
              {t('transcriptions.open_note', 'Open note')}
            </DomeButton>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <DomeButton
          type="button"
          size="sm"
          variant="outline"
          disabled={!md}
          onClick={() => downloadTextFile(`${resource.title || 'transcript'}.md`, md, 'text/markdown')}
        >
          {t('transcriptions.export_md')}
        </DomeButton>
        <DomeButton
          type="button"
          size="sm"
          variant="outline"
          disabled={!structured}
          onClick={() =>
            downloadTextFile(
              `${resource.title || 'transcript'}.json`,
              JSON.stringify(structured ?? {}, null, 2),
              'application/json',
            )
          }
        >
          {t('transcriptions.export_json')}
        </DomeButton>
        <DomeButton
          type="button"
          size="sm"
          variant="outline"
          disabled={!srt}
          onClick={() => downloadTextFile(`${resource.title || 'transcript'}.srt`, srt, 'text/plain')}
        >
          {t('transcriptions.export_srt')}
        </DomeButton>
      </div>

      {md ? (
        <pre
          className="whitespace-pre-wrap rounded-xl border p-3 text-xs leading-relaxed"
          style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)', color: 'var(--dome-text)' }}
        >
          {md}
        </pre>
      ) : (
        <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
          {t('media.transcript_empty_hint')}
        </p>
      )}
    </div>
  );
}
