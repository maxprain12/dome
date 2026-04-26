import { X } from 'lucide-react';
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
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px 3px 6px',
        borderRadius: 6,
        border: `1px solid color-mix(in srgb, var(--accent) ${sticky ? 40 : 25}%, var(--border))`,
        background: sticky ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'color-mix(in srgb, var(--accent) 6%, transparent)',
        fontSize: 11,
        color: 'var(--secondary-text)',
        maxWidth: 200,
      }}
    >
      <span style={{ flexShrink: 0, color: 'var(--accent)' }}>{sticky ? '∞' : '1×'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          color: 'var(--tertiary-text)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
        title={t('chat.remove_skill_context')}
      >
        <X style={{ width: 11, height: 11 }} />
      </button>
    </div>
  );
}
