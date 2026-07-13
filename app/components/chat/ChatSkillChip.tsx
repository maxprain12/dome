import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function ChatSkillChip({
  label,
  onRemove,
  sticky,
}: {
  label: string;
  onRemove: () => void;
  sticky?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <span
      className={`composer-inline-token composer-inline-token--skill${
        sticky ? ' composer-inline-token--sticky' : ''
      }`}
    >
      <span className="composer-inline-token__icon" aria-hidden>
        <HugeiconsIcon icon={SparklesIcon} className="size-3" />
      </span>
      <span className="composer-inline-token__badge">{sticky ? '∞' : '1×'}</span>
      <span className="composer-inline-token__label" title={label}>
        {label}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        className="composer-inline-token__remove"
        title={t('chat.remove_skill_context')}
        aria-label={t('chat.remove_skill_context')}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" aria-hidden />
      </Button>
    </span>
  );
}
