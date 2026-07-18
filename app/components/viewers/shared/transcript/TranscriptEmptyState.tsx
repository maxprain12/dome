import type { TFunction } from 'i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { File02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';

interface TranscriptEmptyStateProps {
  t: TFunction;
  hint: string;
  onTranscribe?: () => void;
  transcribing?: boolean;
}

export default function TranscriptEmptyState({
  t, hint, onTranscribe, transcribing = false,
}: TranscriptEmptyStateProps) {
  return (
    <Empty className="min-h-[180px]">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={File02Icon} /></EmptyMedia>
        <EmptyTitle>{t('media.transcript', { defaultValue: 'Transcript' })}</EmptyTitle>
        <EmptyDescription>{hint}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {onTranscribe ? (
        <Button
          type="button"
          onClick={onTranscribe}
          disabled={transcribing}
        >
          {transcribing
            ? <Spinner data-icon="inline-start" />
            : <HugeiconsIcon icon={File02Icon} data-icon="inline-start" />}
          {transcribing ? t('media.transcribing') : t('media.transcribe_to_note')}
        </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">{t('media.transcript_editorial_hint')}</p>
      </EmptyContent>
    </Empty>
  );
}
