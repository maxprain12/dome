import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DeckSourcesTabProps {
  sourceIds: string[];
  sourceTitles: Record<string, string>;
}

export default function DeckSourcesTab({ sourceIds, sourceTitles }: DeckSourcesTabProps) {
  const { t } = useTranslation();

  if (sourceIds.length === 0) {
    return (
      <p className="lr-tab-empty">
        {t('learn.deck_no_sources', 'No linked sources.')}
      </p>
    );
  }

  return (
    <div className="lr-body" style={{ paddingTop: 16 }}>
      <div className="lr-deck-info-sources">
        {sourceIds.map((id) => (
          <span key={id} className="lr-source-chip">
            <FileText size={12} aria-hidden />
            {sourceTitles[id] ?? id.slice(0, 8)}
          </span>
        ))}
      </div>
    </div>
  );
}
