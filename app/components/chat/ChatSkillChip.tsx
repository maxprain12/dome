import { Sparkles, X } from 'lucide-react';
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
        <Sparkles size={12} strokeWidth={2} />
      </span>
      <span className="composer-inline-token__badge">{sticky ? '∞' : '1×'}</span>
      <span className="composer-inline-token__label" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="composer-inline-token__remove"
        title={t('chat.remove_skill_context')}
        aria-label={t('chat.remove_skill_context')}
      >
        <X size={11} strokeWidth={2} aria-hidden />
      </button>
    </span>
  );
}
