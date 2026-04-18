import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import DomeButton from '@/components/ui/DomeButton';
import { useTabStore } from '@/lib/store/useTabStore';
import { downloadTextFile, structuredToMarkdown, structuredToSrt } from '@/lib/transcription/export';
import type { TranscriptStructured } from '@/lib/transcription/export';
import type { Resource } from '@/types';

type CallMeta = {
  summary?: string;
  action_items?: string[];
  decisions?: string[];
};

function parseMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default function TranscriptionDetailPage({ noteId }: { noteId: string }) {
  const { t } = useTranslation();
  const openNoteTab = useTabStore((s) => s.openNoteTab);
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!noteId || !window.electron?.db?.resources?.getById) {
      setResource(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electron.db.resources.getById(noteId);
      if (res.success && res.data) setResource(res.data);
      else setResource(null);
    } catch {
      setResource(null);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on('resource:updated', (payload: { id?: string }) => {
      if (payload?.id === noteId) void load();
    });
    return () => unsub?.();
  }, [load, noteId]);

  const meta = resource ? parseMeta(resource.metadata) : {};
  const structured = meta.transcription_structured as TranscriptStructured | undefined;
  const call = (meta.call || {}) as CallMeta;
  const sourceAudioId = typeof meta.source_audio_id === 'string' ? meta.source_audio_id : '';

  const onRegenerateSummary = async () => {
    try {
      const res = await window.electron?.calls?.regenerateSummary?.({ noteId });
      if (res?.success) {
        notifications.show({ title: t('common.success'), message: t('call.summary_ready'), color: 'green' });
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
    }
  };

  const onRetranscribe = async () => {
    if (!sourceAudioId) {
      notifications.show({ title: t('common.error'), message: t('transcriptions.list_empty'), color: 'yellow' });
      return;
    }
    try {
      const res = await window.electron?.transcription?.regenerateLinkedNote?.({ resourceId: sourceAudioId });
      if (res?.success) {
        notifications.show({ title: t('media.regenerate_note_done'), message: '', color: 'green' });
        void load();
      } else {
        notifications.show({ title: t('media.regenerate_note_failed'), message: res?.error || '', color: 'red' });
      }
    } catch (e) {
      notifications.show({
        title: t('media.regenerate_note_failed'),
        message: e instanceof Error ? e.message : '',
        color: 'red',
      });
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

  const md = structured ? structuredToMarkdown(structured) : '';
  const srt = structured ? structuredToSrt(structured) : '';

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4" style={{ background: 'var(--dome-bg)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
          {resource.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <DomeButton type="button" size="sm" variant="outline" onClick={() => openNoteTab(resource.id, resource.title || '')}>
            {t('transcriptions.open_note')}
          </DomeButton>
          <DomeButton type="button" size="sm" variant="outline" onClick={() => void onRegenerateSummary()}>
            {t('transcriptions.detail_regenerate_summary')}
          </DomeButton>
          <DomeButton type="button" size="sm" variant="outline" onClick={() => void onRetranscribe()} disabled={!sourceAudioId}>
            {t('transcriptions.detail_retranscribe')}
          </DomeButton>
        </div>
      </div>

      {(call.summary || (call.action_items && call.action_items.length)) && (
        <div
          className="rounded-xl border p-3 text-sm"
          style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
        >
          {call.summary ? (
            <div className="mb-3">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('transcriptions.detail_summary')}
              </h2>
              <p style={{ color: 'var(--dome-text)' }}>{call.summary}</p>
            </div>
          ) : null}
          {call.action_items && call.action_items.length > 0 ? (
            <div className="mb-3">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('transcriptions.detail_actions')}
              </h2>
              <ul className="list-disc pl-5" style={{ color: 'var(--dome-text)' }}>
                {call.action_items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {call.decisions && call.decisions.length > 0 ? (
            <div>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('transcriptions.detail_decisions')}
              </h2>
              <ul className="list-disc pl-5" style={{ color: 'var(--dome-text)' }}>
                {call.decisions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

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
