import { useTranslation } from 'react-i18next';
import { InlineSearch } from '@/components/search/SimpleSearch';

export function HomeSearchBar({
  onResourceSelect,
}: {
  onResourceSelect: (resource: { id: string; type: string; title: string }) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="h-search-wrap">
      <div className="h-search h-search-embed">
        <InlineSearch
          onResourceSelect={onResourceSelect}
          placeholder={t('dashboard.search_editorial_placeholder')}
        />
      </div>
    </div>
  );
}
