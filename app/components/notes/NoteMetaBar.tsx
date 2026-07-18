import { HugeiconsIcon } from '@hugeicons/react';
import {
  Clock01Icon,
  PencilEdit02Icon,
  HistoryIcon,
  Link02Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

export interface TagRowItem {
  id: string;
  name: string;
}

const EMPTY_TAGS: TagRowItem[] = [];

interface NoteMetaBarProps {
  wordCount: number;
  editedRelative?: string | null;
  backlinksCount?: number;
  aiReadyHint?: boolean;
  tags?: TagRowItem[];
  onRequestAddTag?: () => void;
}

export default function NoteMetaBar({
  wordCount,
  editedRelative,
  backlinksCount = 0,
  aiReadyHint = false,
  tags = EMPTY_TAGS,
  onRequestAddTag,
}: NoteMetaBarProps) {
  const { t } = useTranslation();
  const mins = Math.max(1, Math.ceil(wordCount / 200));

  const hasTagsRow = tags.length > 0 || Boolean(onRequestAddTag);

  return (
    <div className="note-doc-meta-stack" aria-live="polite">
      <div className="note-doc-meta note-doc-meta--primary">
        <span className="note-meta-chip">
          <HugeiconsIcon icon={PencilEdit02Icon} size={11} strokeWidth={2} />
          {wordCount <= 1
            ? t('notes.meta_words_one', { count: wordCount })
            : t('notes.meta_words_other', { count: wordCount })}
        </span>
        <span className="note-meta-chip">
          <HugeiconsIcon icon={Clock01Icon} size={11} strokeWidth={2} />~{t('notes.meta_read', { minutes: mins })}
        </span>
        {editedRelative ? (
          <span className="note-meta-chip">
            <HugeiconsIcon icon={HistoryIcon} size={11} strokeWidth={2} />
            {t('notes.meta_edited', { relative: editedRelative })}
          </span>
        ) : null}

        {hasTagsRow ? (
          <span className="note-meta-tags">
            {tags.map((tg) => (
              <span key={tg.id} className="note-meta-tag">
                {tg.name}
              </span>
            ))}
            {onRequestAddTag ? (
              <button type="button" className="note-meta-tag-add" onClick={onRequestAddTag}>
                {t('notes.add_tag')}
              </button>
            ) : null}
          </span>
        ) : null}

        <span style={{ flex: 1 }} />

        <span className="note-meta-chip ai-chip note-meta-ai-muted" title={t('notes.meta_ai_ready_help')}>
          <span className="note-meta-dot-small" aria-hidden />
          {aiReadyHint ? t('notes.meta_ai_ready') : t('notes.meta_ai_workspace')}
        </span>
      </div>

      {backlinksCount > 0 ? (
        <div className="note-doc-meta note-doc-meta--secondary">
          <span className="note-meta-chip backlinks-chip">
            <HugeiconsIcon icon={Link02Icon} size={11} strokeWidth={2} />
            {backlinksCount === 1
              ? t('notes.backlinks_one', { count: backlinksCount })
              : t('notes.backlinks_other', { count: backlinksCount })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
