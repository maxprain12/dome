import { ArrowLeft02Icon, FileNotFoundIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
interface LearnViewerEmptyProps { onBack: () => void; corrupt?: boolean; }
export default function LearnViewerEmpty({ onBack, corrupt }: LearnViewerEmptyProps) { const { t } = useTranslation(); return <div className="flex h-full flex-col gap-4 p-5"><Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onBack}><HugeiconsIcon icon={ArrowLeft02Icon} data-icon="inline-start" />{t('learn.back_to_library', 'Back to library')}</Button><Empty className="flex-1"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={FileNotFoundIcon} /></EmptyMedia><EmptyTitle>{corrupt ? t('learn.viewer_corrupt_title', "This content couldn't be displayed") : t('learn.viewer_empty_title', 'Nothing to show yet')}</EmptyTitle><EmptyDescription>{corrupt ? t('learn.viewer_corrupt_sub', 'The generated content seems incomplete or invalid. Try generating it again.') : t('learn.viewer_empty_sub', 'This item has no content yet.')}</EmptyDescription></EmptyHeader></Empty></div>; }
