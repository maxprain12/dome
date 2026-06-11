import {
  Brain,
  Map,
  HelpCircle,
  BookOpen,
  MessageCircleQuestion,
  CalendarRange,
  Table2,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LearnDeckItem } from '@/lib/learn/types';
import { visualTypeFor } from '@/lib/learn/deckItems';

export interface LearnDeckCardProps {
  item: LearnDeckItem & { glyph: string };
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

function typeIcon(type: LearnDeckItem['type']) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true as const };
  switch (type) {
    case 'flashcards':
      return <Brain {...props} />;
    case 'mindmap':
      return <Map {...props} />;
    case 'quiz':
      return <HelpCircle {...props} />;
    case 'guide':
      return <BookOpen {...props} />;
    case 'faq':
      return <MessageCircleQuestion {...props} />;
    case 'timeline':
      return <CalendarRange {...props} />;
    case 'table':
      return <Table2 {...props} />;
    default:
      return <Brain {...props} />;
  }
}

function formatRelative(ts?: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function LearnDeckCard({ item, onOpen, onEdit, onDelete }: LearnDeckCardProps) {
  const { t } = useTranslation();
  const visual = visualTypeFor(item);
  const mastery = item.mastery ?? 0;
  const typeLabels: Record<LearnDeckItem['type'], string> = {
    flashcards: t('learn.tab_decks', 'Flashcards'),
    mindmap: t('learn.tab_mindmaps', 'Mind maps'),
    quiz: t('learn.tab_quizzes', 'Quizzes'),
    guide: t('learn.tab_guides', 'Guides'),
    faq: t('learn.tab_faqs', 'FAQs'),
    timeline: t('learn.tab_timelines', 'Timelines'),
    table: t('learn.tab_tables', 'Tables'),
    audio: t('learn.type_audio', 'Audio'),
    video: t('content.video', 'Video'),
    research: t('content.research', 'Research'),
  };
  const countLabel =
    item.type === 'flashcards'
      ? t('learn.card_count_flash', '{{count}} cards', { count: item.count })
      : t('learn.card_count_items', '{{count}} items', { count: item.count });

  return (
    <div
      className="lr-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`lr-card-visual ${visual}`}>
        <span className="lr-card-typebadge">
          {typeIcon(item.type)}
          {typeLabels[item.type] ?? item.type}
        </span>
        <span className="lr-card-thumb-glyph">{item.glyph}</span>
      </div>
      <div className="lr-card-body">
        <div className="lr-card-title">{item.title}</div>
        <div className="lr-card-meta">
          <span>{countLabel}</span>
          <span className="dot" aria-hidden />
          <span>{formatRelative(item.lastSeen)}</span>
        </div>
        {item.type === 'flashcards' ? (
          <div className={`lr-card-progress${mastery < 30 ? ' dim' : ''}`}>
            <div className="fill" style={{ width: `${Math.min(100, mastery)}%` }} />
          </div>
        ) : null}
        <div className="lr-card-footer">
          {item.type === 'flashcards' ? (
            <>
              <span className="mastery">{mastery}%</span>
              {(item.dueCount ?? 0) > 0 ? (
                <span className="due">
                  {t('learn.due_count', '{{count}} due', { count: item.dueCount })}
                </span>
              ) : (
                <span>{t('learn.up_to_date', 'Up to date')}</span>
              )}
            </>
          ) : (
            <span>{t('learn.open_item', 'Open')}</span>
          )}
          <span style={{ display: 'flex', gap: 4 }}>
            {onEdit ? (
              <button
                type="button"
                className="lr-btn lr-btn-ghost lr-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                aria-label={t('ui.edit', 'Edit')}
              >
                <Pencil size={12} />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="lr-btn lr-btn-ghost lr-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label={t('ui.delete', 'Delete')}
              >
                <Trash2 size={12} />
              </button>
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
}
