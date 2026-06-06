import { useTranslation } from 'react-i18next';
import { CheckCircle2, HardDrive, Lock, Zap } from 'lucide-react';
import { PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { accentMix, ACCENT_END } from '@/lib/ui/accent';
import ProviderBrandIcon from '@/components/settings/ai/ProviderBrandIcon';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeIconBox from '@/components/ui/DomeIconBox';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';

export interface AIProviderSelectionProps {
  provider: AIProviderType;
  onProviderChange: (provider: AIProviderType) => void;
  showSectionLabel?: boolean;
  /** When false, no card appears selected (e.g. onboarding skip) */
  highlightSelection?: boolean;
}

export default function AIProviderSelection({
  provider,
  onProviderChange,
  showSectionLabel = true,
  highlightSelection = true,
}: AIProviderSelectionProps) {
  const { t } = useTranslation();
  const activeProvider = highlightSelection ? provider : null;

  return (
    <div>
      {showSectionLabel ? (
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">
          {t('settings.ai.provider')}
        </DomeSectionLabel>
      ) : null}

      <div className="space-y-2">
        {DOME_PROVIDER_ENABLED && (
          <button
            type="button"
            onClick={() => onProviderChange('dome')}
            className="relative w-full p-4 rounded-xl text-left transition-all cursor-pointer overflow-hidden"
            style={{
              background:
                activeProvider === 'dome'
                  ? `linear-gradient(135deg, var(--dome-accent) 0%, ${ACCENT_END} 100%)`
                  : 'var(--dome-surface)',
              border: activeProvider === 'dome' ? '2px solid var(--dome-accent)' : '2px solid var(--dome-border)',
              boxShadow: activeProvider === 'dome' ? `0 4px 16px ${accentMix(25)}` : 'none',
            }}
          >
            {activeProvider === 'dome' && (
              <div
                className="absolute inset-0 pointer-events-none opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, var(--dome-accent-bg), transparent 60%)' }}
              />
            )}
            <div className="relative flex items-center gap-3">
              <DomeIconBox
                size="md"
                className="!w-9 !h-9 !rounded-lg"
                background={activeProvider === 'dome' ? 'rgba(255,255,255,0.15)' : 'var(--dome-accent-bg)'}
              >
                <ProviderBrandIcon provider="dome" size={22} />
              </DomeIconBox>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold" style={{ color: activeProvider === 'dome' ? 'var(--base-text)' : 'var(--dome-text)' }}>
                    {PROVIDERS.dome.name}
                  </span>
                  <DomeBadge
                    label={t('settings.ai.recommended')}
                    size="xs"
                    variant={activeProvider === 'dome' ? 'outline' : 'soft'}
                    color={activeProvider === 'dome' ? '#ffffff' : 'var(--dome-accent)'}
                    className={activeProvider === 'dome' ? '!border-white/30 !text-white' : ''}
                  />
                </div>
                <p className="text-xs" style={{ color: activeProvider === 'dome' ? 'rgba(255,255,255,0.7)' : 'var(--dome-text-muted)' }}>
                  {`${PROVIDERS.dome.description}. ${t('settings.ai.no_own_key')}.`}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {[{ icon: Lock, label: t('settings.ai.private') }, { icon: Zap, label: t('settings.ai.fast') }].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1 px-2 py-1 rounded-md"
                    style={{
                      backgroundColor: activeProvider === 'dome' ? 'rgba(255,255,255,0.12)' : accentMix(10),
                      color: activeProvider === 'dome' ? 'rgba(255,255,255,0.85)' : 'var(--dome-accent)',
                    }}
                  >
                    <Icon className="size-2.5" />
                    <span className="text-[10px] font-medium">{label}</span>
                  </div>
                ))}
                {activeProvider === 'dome' && <CheckCircle2 className="size-4" style={{ color: 'var(--dome-accent-bg)' }} />}
              </div>
            </div>
          </button>
        )}

        <div className="grid grid-cols-3 gap-2">
          {AI_PROVIDER_OPTIONS.filter((o) => o.value !== 'dome' && o.value !== 'ollama').map((option) => {
            const isSelected = activeProvider === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => !option.disabled && onProviderChange(option.value)}
                disabled={option.disabled}
                className="relative p-3 rounded-xl text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: isSelected ? accentMix(8) : 'transparent',
                  border: isSelected ? '2px solid var(--dome-accent)' : '2px solid var(--dome-border)',
                  boxShadow: isSelected ? `0 2px 8px ${accentMix(15)}` : 'none',
                }}
              >
                {option.badge ? (
                  <span className="absolute -top-1.5 -right-1.5">
                    <DomeBadge label={option.badge} size="xs" variant="filled" color="var(--dome-accent)" className="!text-[8px] !py-0.5 !px-1.5" />
                  </span>
                ) : null}
                <div className="flex items-start gap-2.5 w-full">
                  <DomeIconBox
                    size="sm"
                    className="!w-7 !h-7 !rounded-md shrink-0"
                    background={isSelected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
                  >
                    <ProviderBrandIcon provider={option.value} size={16} />
                  </DomeIconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-tight mb-0.5" style={{ color: 'var(--dome-text)' }}>
                      {option.label}
                    </p>
                    <p className="text-[10px] leading-tight" style={{ color: 'var(--dome-text-muted)' }}>
                      {t('settings.ai.api_key_required')}
                    </p>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--dome-accent)' }} />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>

        {(() => {
          const ollamaOption = AI_PROVIDER_OPTIONS.find((o) => o.value === 'ollama');
          if (!ollamaOption) return null;
          const isSelected = activeProvider === 'ollama';
          return (
            <button
              type="button"
              onClick={() => onProviderChange('ollama')}
              className="relative w-full p-3 rounded-xl text-left transition-all cursor-pointer"
              style={{
                backgroundColor: isSelected ? accentMix(8) : 'transparent',
                border: isSelected ? '2px solid var(--dome-accent)' : '2px solid var(--dome-border)',
                boxShadow: isSelected ? `0 2px 8px ${accentMix(15)}` : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <DomeIconBox
                  size="sm"
                  className="!w-8 !h-8 !rounded-md shrink-0"
                  background={isSelected ? 'var(--dome-accent-bg)' : 'var(--dome-bg-hover)'}
                >
                  <ProviderBrandIcon provider="ollama" size={18} />
                </DomeIconBox>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold" style={{ color: 'var(--dome-text)' }}>
                      {ollamaOption.label}
                    </p>
                    <DomeBadge label={t('settings.ai.local_badge')} size="xs" color="var(--dome-accent)" />
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('settings.ai.private_local')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ backgroundColor: accentMix(10), color: 'var(--dome-accent)' }}>
                    <HardDrive className="size-2.5" />
                    <span className="text-[10px] font-medium">{t('onboarding.offline')}</span>
                  </div>
                  {isSelected && <CheckCircle2 className="size-3.5" style={{ color: 'var(--dome-accent)' }} />}
                </div>
              </div>
            </button>
          );
        })()}
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
    provider === 'qwen'
  );
}
