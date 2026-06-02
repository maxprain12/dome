import {
  Brain,
  Map,
  HelpCircle,
  BookOpen,
  MessageCircleQuestion,
  CalendarRange,
  Table2,
  Headphones,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudioOutputType } from '@/types';

interface StepTypePickerProps {
  selected: StudioOutputType | null;
  onSelect: (type: StudioOutputType) => void;
}

export default function StepTypePicker({ selected, onSelect }: StepTypePickerProps) {
  const { t } = useTranslation();

  const types = useMemo(
    () =>
      [
        {
          type: 'mindmap' as const,
          icon: <Map size={18} />,
          name: t('learn.type_mindmap', 'Mind map'),
          sub: t('learn.type_mindmap_desc', 'Concept map'),
        },
        {
          type: 'flashcards' as const,
          icon: <Brain size={18} />,
          name: t('learn.tab_decks', 'Flashcards'),
          sub: t('learn.type_flashcards_desc', 'Spaced repetition'),
        },
        {
          type: 'quiz' as const,
          icon: <HelpCircle size={18} />,
          name: t('learn.tab_quizzes', 'Quizzes'),
          sub: t('learn.type_quiz_desc', 'Multiple choice'),
        },
        {
          type: 'guide' as const,
          icon: <BookOpen size={18} />,
          name: t('learn.tab_guides', 'Guides'),
          sub: t('learn.type_guide_desc', 'Structured guide'),
        },
        {
          type: 'faq' as const,
          icon: <MessageCircleQuestion size={18} />,
          name: t('learn.tab_faqs', 'FAQs'),
          sub: t('learn.type_faq_desc', 'Questions and answers'),
        },
        {
          type: 'timeline' as const,
          icon: <CalendarRange size={18} />,
          name: t('learn.tab_timelines', 'Timelines'),
          sub: t('learn.type_timeline_desc', 'Chronological events'),
        },
        {
          type: 'table' as const,
          icon: <Table2 size={18} />,
          name: t('learn.tab_tables', 'Tables'),
          sub: t('learn.type_table_desc', 'Structured data'),
        },
        {
          type: 'audio' as const,
          icon: <Headphones size={18} />,
          name: t('learn.type_audio', 'Audio'),
          sub: t('learn.type_audio_desc', 'Audio summary'),
          disabled: true,
        },
      ] as const,
    [t],
  );

  return (
    <div className="lr-type-grid">
      {types.map((entry) => {
        const isSelected = selected === entry.type;
        const disabled = 'disabled' in entry && entry.disabled;
        return (
          <button
            key={entry.type}
            type="button"
            className={`lr-type${isSelected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
            disabled={disabled}
            onClick={() => !disabled && onSelect(entry.type)}
          >
            {'disabled' in entry && entry.disabled ? (
              <span className="lr-type-soon">{t('common.coming_soon', 'Soon')}</span>
            ) : null}
            <span className="lr-type-icon">{entry.icon}</span>
            <span className="lr-type-name">{entry.name}</span>
            <span className="lr-type-sub">{entry.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
