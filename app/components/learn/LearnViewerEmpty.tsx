import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LearnViewerEmptyProps {
  onBack: () => void;
  /** True when the content failed to parse (vs. simply having no items). */
  corrupt?: boolean;
}

/**
 * Shared empty/error state for the secondary study viewers (guide/faq/mindmap/
 * timeline/table). Replaces the previous silent blank render when content is
 * missing or malformed.
 */
export default function LearnViewerEmpty({ onBack, corrupt }: LearnViewerEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="lr-viewer-empty">
      <button type="button" className="lr-deck-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden />
        {t('learn.back_to_library', 'Back to library')}
      </button>
      <div className="lr-empty">
        <div className="lr-empty-art">
          <FileQuestion size={32} aria-hidden />
        </div>
        <h2>
          {corrupt
            ? t('learn.viewer_corrupt_title', "This content couldn't be displayed")
            : t('learn.viewer_empty_title', 'Nothing to show yet')}
        </h2>
        <p>
          {corrupt
            ? t('learn.viewer_corrupt_sub', 'The generated content seems incomplete or invalid. Try generating it again.')
            : t('learn.viewer_empty_sub', 'This item has no content yet.')}
        </p>
      </div>
    </div>
  );
}
