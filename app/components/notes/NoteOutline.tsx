import { useTranslation } from 'react-i18next';
import type { NoteOutlineItem } from '@/components/markdown/extensions';

interface NoteOutlineProps {
  items: NoteOutlineItem[];
  onJump: (pos: number) => void;
}

export default function NoteOutline({ items, onJump }: NoteOutlineProps) {
  const { t } = useTranslation();
  if (items.length < 3) return null;
  return (
    <nav className="note-outline" aria-label={t('notes.outline_title')}>
      {items.map((item) => (
        <button
          key={`${item.pos}-${item.text}`}
          type="button"
          className="note-outline-item"
          data-level={item.level}
          onClick={() => onJump(item.pos)}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
