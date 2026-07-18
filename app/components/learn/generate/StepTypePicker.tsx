import {
  BookOpen01Icon,
  BrainIcon,
  BubbleChatQuestionIcon,
  CalendarRangeIcon,
  HeadphonesIcon,
  HelpCircleIcon,
  MapsIcon,
  TableIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { StudioOutputType } from '@/types';

interface StepTypePickerProps {
  selected: StudioOutputType | null;
  onSelect: (type: StudioOutputType) => void;
}

type TypeEntry = {
  type: StudioOutputType;
  icon: IconSvgElement;
  name: string;
  sub: string;
  disabled?: boolean;
};

export default function StepTypePicker({ selected, onSelect }: StepTypePickerProps) {
  const { t } = useTranslation();

  const types = useMemo<TypeEntry[]>(
    () => [
      {
        type: 'mindmap',
        icon: MapsIcon,
        name: t('learn.type_mindmap', 'Mind map'),
        sub: t('learn.type_mindmap_desc', 'Concept map'),
      },
      {
        type: 'flashcards',
        icon: BrainIcon,
        name: t('learn.tab_decks', 'Flashcards'),
        sub: t('learn.type_flashcards_desc', 'Spaced repetition'),
      },
      {
        type: 'quiz',
        icon: HelpCircleIcon,
        name: t('learn.tab_quizzes', 'Quizzes'),
        sub: t('learn.type_quiz_desc', 'Multiple choice'),
      },
      {
        type: 'guide',
        icon: BookOpen01Icon,
        name: t('learn.tab_guides', 'Guides'),
        sub: t('learn.type_guide_desc', 'Structured guide'),
      },
      {
        type: 'faq',
        icon: BubbleChatQuestionIcon,
        name: t('learn.tab_faqs', 'FAQs'),
        sub: t('learn.type_faq_desc', 'Questions and answers'),
      },
      {
        type: 'timeline',
        icon: CalendarRangeIcon,
        name: t('learn.tab_timelines', 'Timelines'),
        sub: t('learn.type_timeline_desc', 'Chronological events'),
      },
      {
        type: 'table',
        icon: TableIcon,
        name: t('learn.tab_tables', 'Tables'),
        sub: t('learn.type_table_desc', 'Structured data'),
      },
      {
        type: 'audio',
        icon: HeadphonesIcon,
        name: t('learn.type_audio', 'Audio'),
        sub: t('learn.type_audio_desc', 'Audio summary'),
        disabled: true,
      },
    ],
    [t],
  );

  return (
    <ToggleGroup
      value={selected ? [selected] : []}
      onValueChange={(value) => value[0] && onSelect(value[0] as StudioOutputType)}
      variant="outline"
      className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {types.map((entry) => (
        <ToggleGroupItem
          key={entry.type}
          value={entry.type}
          disabled={entry.disabled}
          className="h-auto min-h-16 w-full min-w-0 shrink justify-start gap-3 overflow-hidden p-3 text-left whitespace-normal"
        >
          <HugeiconsIcon icon={entry.icon} className="size-4 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-hidden">
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="truncate font-medium">{entry.name}</span>
              {entry.disabled ? (
                <Badge variant="secondary" className="shrink-0 text-[0.625rem]">
                  {t('common.coming_soon', 'Soon')}
                </Badge>
              ) : null}
            </span>
            <span className="line-clamp-2 w-full text-xs text-muted-foreground">{entry.sub}</span>
          </span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
