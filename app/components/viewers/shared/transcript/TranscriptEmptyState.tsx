import type { TFunction } from 'i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { File02Icon } from '@hugeicons/core-free-icons';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface TranscriptEmptyStateProps {
  t: TFunction;
  hint: string;
}

export default function TranscriptEmptyState({
  t, hint,
}: TranscriptEmptyStateProps) {
  return (
    <Empty className="min-h-[180px]">
      <EmptyHeader>
        <EmptyMedia variant="icon"><HugeiconsIcon icon={File02Icon} /></EmptyMedia>
        <EmptyTitle>{t('media.transcript', { defaultValue: 'Transcript' })}</EmptyTitle>
        <EmptyDescription>{hint}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>

        <p className="text-xs text-muted-foreground">{t('media.transcript_editorial_hint')}</p>
      </EmptyContent>
    </Empty>
  );
}
