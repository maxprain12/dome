import { BookOpen01Icon, BrainIcon, BubbleChatQuestionIcon, CalendarRangeIcon, Delete02Icon, HelpCircleIcon, MapsIcon, PencilIcon, TableIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import type { LearnDeckItem } from '@/lib/learn/types';

export interface LearnDeckCardProps { item: LearnDeckItem & { glyph: string }; onOpen: () => void; onEdit?: () => void; onDelete?: () => void; }

const TYPE_ICONS: Record<LearnDeckItem['type'], IconSvgElement> = {
  flashcards: BrainIcon, mindmap: MapsIcon, quiz: HelpCircleIcon, guide: BookOpen01Icon,
  faq: BubbleChatQuestionIcon, timeline: CalendarRangeIcon, table: TableIcon,
  audio: BookOpen01Icon, video: BookOpen01Icon, research: BookOpen01Icon,
};

function formatRelative(ts?: number): string {
  if (!ts) return '—';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LearnDeckCard({ item, onOpen, onEdit, onDelete }: LearnDeckCardProps) {
  const { t } = useTranslation();
  const mastery = item.mastery ?? 0;
  const typeLabels: Record<LearnDeckItem['type'], string> = {
    flashcards: t('learn.tab_decks', 'Flashcards'), mindmap: t('learn.tab_mindmaps', 'Mind maps'), quiz: t('learn.tab_quizzes', 'Quizzes'), guide: t('learn.tab_guides', 'Guides'), faq: t('learn.tab_faqs', 'FAQs'), timeline: t('learn.tab_timelines', 'Timelines'), table: t('learn.tab_tables', 'Tables'), audio: t('learn.type_audio', 'Audio'), video: t('content.video', 'Video'), research: t('content.research', 'Research'),
  };
  const countLabel = item.type === 'flashcards' ? t('learn.card_count_flash', '{{count}} cards', { count: item.count }) : t('learn.card_count_items', '{{count}} items', { count: item.count });

  return <Card size="sm" className="min-w-0">
    <CardHeader>
      <div className="flex size-10 items-center justify-center rounded-xl bg-muted" aria-hidden><HugeiconsIcon icon={TYPE_ICONS[item.type]} /></div>
      <CardTitle className="truncate">{item.title}</CardTitle>
      <CardDescription>{countLabel} · {formatRelative(item.lastSeen)}</CardDescription>
      {(onEdit || onDelete) ? <CardAction><DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t('common.more', 'More')} />}>•••</DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuGroup>
        {onEdit ? <DropdownMenuItem onClick={onEdit}><HugeiconsIcon icon={PencilIcon} />{t('ui.edit', 'Edit')}</DropdownMenuItem> : null}
        {onDelete ? <DropdownMenuItem variant="destructive" onClick={onDelete}><HugeiconsIcon icon={Delete02Icon} />{t('ui.delete', 'Delete')}</DropdownMenuItem> : null}
      </DropdownMenuGroup></DropdownMenuContent></DropdownMenu></CardAction> : null}
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <Badge variant="lime" className="w-fit"><HugeiconsIcon icon={TYPE_ICONS[item.type]} />{typeLabels[item.type]}</Badge>
      {item.type === 'flashcards' ? <Progress value={Math.min(100, mastery)} aria-label={t('learn.kpi_mastery')} /> : null}
    </CardContent>
    <CardFooter className="justify-between"><span className="text-xs text-muted-foreground">{item.type === 'flashcards' ? ((item.dueCount ?? 0) > 0 ? t('learn.due_count', '{{count}} due', { count: item.dueCount }) : t('learn.up_to_date', 'Up to date')) : item.glyph}</span><Button type="button" variant="outline" size="sm" onClick={onOpen}>{t('learn.open_item', 'Open')}</Button></CardFooter>
  </Card>;
}
