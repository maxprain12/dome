import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, HardDrive, KeyRound } from 'lucide-react';
import { PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { ACCENT_END } from '@/lib/ui/accent';
import ProviderBrandIcon from '@/components/settings/ai/ProviderBrandIcon';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeIconBox from '@/components/ui/DomeIconBox';
import { cn } from '@/lib/utils';

function ProviderCardCheck({ selected }: { selected: boolean }) {
  return (
    <CheckCircle2
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-2 right-2 size-3.5 shrink-0 transition-opacity duration-150',
        selected ? 'opacity-100' : 'opacity-0',
      )}
      style={{ color: 'var(--dome-accent)' }}
    />
  );
}

function ProviderKeyStatus({
  hasKey,
  configuredLabel,
  needsKeyLabel,
}: {
  hasKey: boolean;
  configuredLabel: string;
  needsKeyLabel: string;
}) {
  return (
    <span
      className="absolute bottom-2 right-2 inline-flex shrink-0"
      title={hasKey ? configuredLabel : needsKeyLabel}
      aria-label={hasKey ? configuredLabel : needsKeyLabel}
    >
      <KeyRound
        aria-hidden
        className="size-3"
        style={{ color: hasKey ? 'var(--success)' : 'var(--dome-text-muted)', opacity: hasKey ? 1 : 0.45 }}
      />
    </span>
  );
}

export interface AIProviderSelectionProps {
  provider: AIProviderType;
  onProviderChange: (provider: AIProviderType) => void;
  showSectionLabel?: boolean;
  /** When false, no card appears selected (e.g. onboarding skip) */
  highlightSelection?: boolean;
  /** provider → tiene API key guardada */
  configuredProviders?: Record<string, boolean>;
}

export default function AIProviderSelection({
  provider,
  onProviderChange,
  showSectionLabel = true,
  highlightSelection = true,
  configuredProviders = {},
}: AIProviderSelectionProps) {
  const { t } = useTranslation();
  const activeProvider = highlightSelection ? provider : null;

  const cloudOptions = useMemo(() => {
    const options = AI_PROVIDER_OPTIONS.filter((o) => o.value !== 'dome' && o.value !== 'ollama');
    return [...options].sort((a, b) => {
      const aSelected = a.value === activeProvider ? 0 : 1;
      const bSelected = b.value === activeProvider ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      const aKey = configuredProviders[a.value] ? 0 : 1;
      const bKey = configuredProviders[b.value] ? 0 : 1;
      if (aKey !== bKey) return aKey - bKey;
      return a.label.localeCompare(b.label);
    });
  }, [activeProvider, configuredProviders]);

  const ollamaOption = AI_PROVIDER_OPTIONS.find((o) => o.value === 'ollama');
  const isOllamaSelected = activeProvider === 'ollama';

  return (
    <div className="ai-provider-picker min-w-0 w-full">
      {showSectionLabel ? (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium text-[var(--dome-text)]">{t('settings.ai.provider')}</p>
          {activeProvider ? (
            <p className="text-xs text-[var(--dome-text-muted)]">
              {t('settings.ai.active_provider')}:{' '}
              <span className="font-medium text-[var(--dome-text)]">
                {PROVIDERS[activeProvider]?.name ?? activeProvider}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        {DOME_PROVIDER_ENABLED ? (
          <button
            type="button"
            onClick={() => onProviderChange('dome')}
            aria-pressed={activeProvider === 'dome'}
            className={cn(
              'ai-provider-picker__featured relative w-full min-w-0 rounded-xl p-3 text-left transition-all cursor-pointer overflow-hidden',
              activeProvider === 'dome'
                ? 'border border-[var(--dome-accent)] shadow-sm'
                : 'border border-[var(--dome-border)] bg-[var(--dome-surface)] hover:border-[var(--dome-border-hover,var(--dome-border))]',
            )}
            style={
              activeProvider === 'dome'
                ? { background: `linear-gradient(135deg, var(--dome-accent) 0%, ${ACCENT_END} 100%)` }
                : undefined
            }
          >
            <ProviderCardCheck selected={activeProvider === 'dome'} />
            <div className="flex items-center gap-2.5 min-w-0 pr-6">
              <DomeIconBox
                size="sm"
                className="!size-8 !rounded-md shrink-0"
                background={activeProvider === 'dome' ? 'rgba(255,255,255,0.15)' : 'var(--dome-accent-bg)'}
              >
                <ProviderBrandIcon provider="dome" size={18} />
              </DomeIconBox>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="truncate text-sm font-semibold"
                    style={{ color: activeProvider === 'dome' ? 'var(--base-text)' : 'var(--dome-text)' }}
                  >
                    {PROVIDERS.dome.name}
                  </span>
                  <DomeBadge
                    label={t('settings.ai.recommended')}
                    size="xs"
                    variant={activeProvider === 'dome' ? 'outline' : 'soft'}
                    color={activeProvider === 'dome' ? 'var(--dome-on-accent)' : 'var(--dome-accent)'}
                    className={activeProvider === 'dome' ? '!border-white/30 !text-white' : ''}
                  />
                </div>
                <p
                  className="text-[11px] leading-snug truncate"
                  style={{ color: activeProvider === 'dome' ? 'rgba(255,255,255,0.75)' : 'var(--dome-text-muted)' }}
                >
                  {t('settings.ai.dome_card_hint')}
                </p>
              </div>
            </div>
          </button>
        ) : null}

        <div
          role="radiogroup"
          aria-label={t('settings.ai.provider')}
          className="ai-provider-picker__grid settings-choice-grid settings-choice-grid--3 gap-2"
        >
          {cloudOptions.map((option) => {
            const isSelected = activeProvider === option.value;
            const hasKey = Boolean(configuredProviders[option.value]);
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => !option.disabled && onProviderChange(option.value)}
                disabled={option.disabled}
                className={cn(
                  'ai-provider-picker__card settings-provider-card relative flex w-full min-w-0 flex-col items-start p-2.5 pr-7 pb-6 rounded-xl text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                  isSelected
                    ? 'border border-[var(--dome-accent)] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                    : 'border border-[var(--dome-border)] bg-[var(--dome-surface)] hover:border-[var(--dome-border-hover,var(--dome-border))]',
                )}
              >
                {option.badge ? (
                  <span className="absolute -top-1.5 -right-1.5">
                    <DomeBadge label={option.badge} size="xs" variant="filled" color="var(--dome-accent)" className="!text-[8px] !py-0.5 !px-1.5" />
                  </span>
                ) : null}
                <ProviderCardCheck selected={isSelected} />
                <ProviderKeyStatus
                  hasKey={hasKey}
                  configuredLabel={t('settings.ai.provider_status_configured')}
                  needsKeyLabel={t('settings.ai.provider_status_needs_key')}
                />
                <DomeIconBox
                  size="sm"
                  className="!size-7 !rounded-md shrink-0 mb-1.5"
                  background={isSelected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
                >
                  <ProviderBrandIcon provider={option.value} size={16} />
                </DomeIconBox>
                <span className="settings-provider-card__title w-full min-w-0 truncate text-xs font-semibold text-[var(--dome-text)]">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {ollamaOption ? (
          <button
            type="button"
            aria-pressed={isOllamaSelected}
            onClick={() => onProviderChange('ollama')}
            className={cn(
              'ai-provider-picker__featured relative w-full min-w-0 rounded-xl p-3 pr-8 text-left transition-all cursor-pointer',
              isOllamaSelected
                ? 'border border-[var(--dome-accent)] bg-[var(--dome-accent-subtle,rgba(101,93,197,0.12))] shadow-sm'
                : 'border border-[var(--dome-border)] bg-[var(--dome-surface)] hover:border-[var(--dome-border-hover,var(--dome-border))]',
            )}
          >
            <ProviderCardCheck selected={isOllamaSelected} />
            <div className="flex items-center gap-2.5 min-w-0">
              <DomeIconBox
                size="sm"
                className="!size-8 !rounded-md shrink-0"
                background={isOllamaSelected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
              >
                <ProviderBrandIcon provider="ollama" size={18} />
              </DomeIconBox>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="truncate text-sm font-semibold text-[var(--dome-text)]">{ollamaOption.label}</span>
                  <DomeBadge label={t('settings.ai.local_badge')} size="xs" color="var(--dome-accent)" />
                </div>
                <p className="text-[11px] text-[var(--dome-text-muted)]">{t('settings.ai.private_local')}</p>
              </div>
              <HardDrive className="size-3.5 shrink-0 text-[var(--dome-text-muted)] opacity-60" aria-hidden />
            </div>
          </button>
        ) : null}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-[var(--dome-text-muted)]">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-2.5 text-[var(--dome-accent)]" aria-hidden />
            {t('settings.ai.provider_legend_active')}
          </span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-2.5 text-[var(--success)]" aria-hidden />
            {t('settings.ai.provider_legend_configured')}
          </span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-2.5 opacity-45" aria-hidden />
            {t('settings.ai.provider_legend_needs_key')}
          </span>
        </p>
      </div>
    </div>
  );
}

export function isCloudAIProvider(provider: AIProviderType): boolean {
  return (
    provider === 'openai' ||
    provider === 'anthropic' ||
    provider === 'google' ||
    provider === 'minimax' ||
    provider === 'openrouter' ||
    provider === 'deepseek' ||
    provider === 'moonshot' ||
    provider === 'qwen' ||
    provider === 'opencode' ||
    provider === 'opencode-go'
  );
}
