import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, File01Icon, Note01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { notifications } from '@/lib/notifications';
import { useTabStore } from '@/lib/store/useTabStore';
import { downloadTextFile, structuredToMarkdown, structuredToSrt } from '@/lib/transcription/export';
import type { TranscriptStructured } from '@/lib/transcription/export';
import type { Resource } from '@/types';
import ViewerShell from '@/components/viewers/shared/ViewerShell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (!resource) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          {t('common.noResourceSelected')}
        </p>
      </div>
    );
  }

  const md = structured ? structuredToMarkdown(structured) : transcriptText;
  const srt = structured ? structuredToSrt(structured) : '';

  return (
    <ViewerShell
      title={resource.title}
      contextLabel={t('transcriptions.list_title')}
      toolbar={(
        <>
          {isAudioTranscription && linkedNoteId && (
            <Button type="button" variant="outline" onClick={() => openNoteTab(linkedNoteId, resource.title || '')} size="sm">
              <HugeiconsIcon icon={Note01Icon} data-icon="inline-start" />
              {t('transcriptions.open_note', 'Open note')}
            </Button>
          )}
          {isAudioTranscription && !linkedNoteId && (
            <Button type="button" variant="outline" onClick={() => void onConvertToNote()} disabled={converting || !transcriptText} size="sm">
              {converting ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Note01Icon} data-icon="inline-start" />}
              {converting ? t('common.loading') : t('transcriptions.detail_convert_to_note', 'Convert to note')}
            </Button>
          )}
          {!isAudioTranscription && resource.type === 'note' && (
            <Button type="button" variant="outline" onClick={() => openNoteTab(resource.id, resource.title || '')} size="sm">
              <HugeiconsIcon icon={Note01Icon} data-icon="inline-start" />
              {t('transcriptions.open_note', 'Open note')}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
              <HugeiconsIcon icon={ArrowDown01Icon} data-icon="inline-start" />
              {t('common.export', { defaultValue: 'Export' })}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={!md} onClick={() => downloadTextFile(`${resource.title || 'transcript'}.md`, md, 'text/markdown')}>
                  {t('transcriptions.export_md')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!structured} onClick={() => downloadTextFile(`${resource.title || 'transcript'}.json`, JSON.stringify(structured ?? {}, null, 2), 'application/json')}>
                  {t('transcriptions.export_json')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!srt} onClick={() => downloadTextFile(`${resource.title || 'transcript'}.srt`, srt, 'text/plain')}>
                  {t('transcriptions.export_srt')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
      contentClassName="overflow-hidden"
    >
      <ScrollArea className="h-full">
        <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
          {md ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('transcriptions.transcript', { defaultValue: 'Transcript' })}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{md}</pre>
              </CardContent>
            </Card>
          ) : (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><HugeiconsIcon icon={File01Icon} /></EmptyMedia>
                <EmptyTitle>{t('transcriptions.list_title')}</EmptyTitle>
                <EmptyDescription>{t('media.transcript_empty_hint')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </ViewerShell>
  );
}
