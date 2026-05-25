'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface AgentIconStepProps {
  selectedIndex: number;
  onChange: (index: number) => void;
}

const ICON_COUNT = 18;

export default function AgentIconStep({ selectedIndex, onChange }: AgentIconStepProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
        {t('onboarding.agent_icon_hint')}
      </p>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: ICON_COUNT }, (_, i) => {
          const idx = i + 1;
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={`agent-icon-${idx}`}
              type="button"
              onClick={() => onChange(idx)}
              aria-pressed={isSelected}
              className={cn(
                'flex items-center justify-center size-12 rounded-xl border-2 transition-all',
                isSelected && 'ring-2 ring-[var(--dome-accent)]',
              )}
              style={{
                borderColor: isSelected ? 'var(--dome-accent)' : 'var(--dome-border)',
                backgroundColor: isSelected ? 'var(--dome-accent-bg)' : 'var(--dome-surface)',
              }}
            >
              <img
                src={`/agents/sprite_${idx}.png`}
                alt={`Icon ${idx}`}
                className="size-8 object-contain"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
