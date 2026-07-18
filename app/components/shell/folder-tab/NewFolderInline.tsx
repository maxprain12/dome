/** Inline new-folder name input — no color until the user picks one later. */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, Folder01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NewFolderInline({
  onConfirm,
  onCancel,
  variant = 'grid',
}: {
  onConfirm: (name: string) => void;
  onCancel: () => void;
  variant?: 'grid' | 'list';
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleConfirm = () => {
    if (value.trim()) onConfirm(value.trim());
  };

  const actions = (
    <div className="dome-new-folder__actions">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleConfirm}
        disabled={!value.trim()}
        aria-label={t('ui.create')}
      >
        <HugeiconsIcon icon={CheckIcon} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onCancel}
        aria-label={t('ui.cancel')}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  );

  if (variant === 'list') {
    return (
      <div className="dome-new-folder dome-new-folder--list">
        <HugeiconsIcon
          icon={Folder01Icon}
          className="size-4 shrink-0 text-muted-foreground"
        />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('folder.folderNamePlaceholder')}
          aria-label={t('folder.folderNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          className="h-7 flex-1 min-w-0"
        />
        {actions}
      </div>
    );
  }

  return (
    <div className="dome-fs-card dome-fs-card--creating">
      <div className="dome-fs-card__cover dome-fs-card__cover--folder">
        <HugeiconsIcon
          icon={Folder01Icon}
          className="dome-fs-card__cover-icon text-muted-foreground"
          strokeWidth={1.25}
        />
      </div>
      <div className="dome-fs-card__footer dome-new-folder__body">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('folder.folderNamePlaceholder')}
          aria-label={t('folder.folderNamePlaceholder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
          className="dome-new-folder__input"
        />
        <div className="dome-new-folder__footer">
          {actions}
        </div>
      </div>
    </div>
  );
}
