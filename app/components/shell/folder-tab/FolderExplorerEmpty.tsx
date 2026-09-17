/** Empty / error states for the folder explorer. */

import { useTranslation } from 'react-i18next';
import {
  FileEditIcon,
  Folder01Icon,
  FolderAddIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import ListState from '@/components/shared/ListState';

export function FolderExplorerError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ListState
      variant="error"
      fullHeight
      title={t('folder.loadError')}
      errorMessage={message}
      onRetry={onRetry}
    />
  );
}

export function FolderExplorerEmpty({
  onImport,
  onNewFolder,
  onNewNote,
}: {
  onImport: () => void;
  onNewFolder: () => void;
  onNewNote: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ListState
      variant="empty"
      fullHeight
      icon={<HugeiconsIcon icon={Folder01Icon} className="size-5" />}
      title={t('folder.emptyTitle')}
      description={t('folder.emptyHint')}
      action={(
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" onClick={onImport}>
            <HugeiconsIcon icon={Upload04Icon} />
            {t('folder.emptyImport')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNewFolder}>
            <HugeiconsIcon icon={FolderAddIcon} />
            {t('folder.newFolderBtn')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onNewNote}>
            <HugeiconsIcon icon={FileEditIcon} />
            {t('folder.newNote')}
          </Button>
        </div>
      )}
    />
  );
}
