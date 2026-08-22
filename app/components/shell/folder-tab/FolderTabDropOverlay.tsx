/** Drop overlay when OS files are dragged over the folder view. */

import { Upload04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';

export default function FolderTabDropOverlay({ active }: { active: boolean }) {
  const { t } = useTranslation();
  if (!active) return null;
  return (
    <div className="dome-folder-view__drop-overlay" aria-hidden>
      <div className="dome-folder-view__drop-overlay-card">
        <HugeiconsIcon icon={Upload04Icon} className="size-6" aria-hidden />
        <span>{t('folder.dropToImport', 'Suelta para importar aquí')}</span>
      </div>
    </div>
  );
}
