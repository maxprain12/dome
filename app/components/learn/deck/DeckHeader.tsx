import { ArrowLeft02Icon, MagicWand01Icon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const EMPTY_SOURCE_TITLES: string[] = [];
interface DeckHeaderProps { title: string; typeLabel: string; description?: string; sourceTitles?: string[]; onBack: () => void; onStudy?: () => void; onGenerate?: () => void; onAddMore?: () => void; }

export default function DeckHeader({ title, typeLabel, description, sourceTitles = EMPTY_SOURCE_TITLES, onBack, onStudy, onGenerate, onAddMore }: DeckHeaderProps) {
  const { t } = useTranslation();
  return <div className="flex flex-col gap-4"><Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onBack}><HugeiconsIcon icon={ArrowLeft02Icon} data-icon="inline-start" />{t('learn.back_to_library', 'Back to library')}</Button><PageHeader eyebrow={typeLabel} title={title} description={description} actions={<>{onStudy ? <Button type="button" onClick={onStudy}>{t('flashcard.study', 'Study')}</Button> : null}{onAddMore ? <Button type="button" variant="outline" onClick={onAddMore}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('learn.add_more_questions', 'Add more questions')}</Button> : null}{onGenerate ? <Button type="button" variant="outline" onClick={onGenerate}><HugeiconsIcon icon={MagicWand01Icon} data-icon="inline-start" />{t('learn.generate', 'Generate')}</Button> : null}</>} />{sourceTitles.length > 0 ? <div className="flex flex-wrap gap-2">{sourceTitles.slice(0, 4).map((source) => <Badge key={source} variant="secondary">{source}</Badge>)}</div> : null}</div>;
}
