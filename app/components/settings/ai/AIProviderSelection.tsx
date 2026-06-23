import { useTranslation } from 'react-i18next';
import { CheckCircle2, HardDrive, KeyRound, Lock, Settings2, Sparkles, Zap } from 'lucide-react';
import { PROVIDERS, type AIProviderType } from '@/lib/ai/models';
import { AI_PROVIDER_OPTIONS, DOME_PROVIDER_ENABLED } from '@/lib/ai/provider-options';
import { isVisibleModelsConfigurable } from '@/lib/ai/visible-models';
import ProviderBrandIcon from '@/components/settings/ai/ProviderBrandIcon';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import { cn } from '@/lib/utils';
// Self-contained: own the provider-card styles so the grid renders correctly in any
// consumer (settings, onboarding, …), not just where AISettingsPanel imports the CSS.
import '@/styles/ai-settings.css';

export interface AIProviderSelectionProps {
  provider: AIProviderType;
  onProviderChange: (provider: AIProviderType) => void;
  showSectionLabel?: boolean;
  /** When false, no card appears selected (e.g. onboarding skip) */
  highlightSelection?: boolean;
  /** provider → tiene API key guardada (badge + orden: configurados primero) */
  configuredProviders?: Record<string, boolean>;
  /** Opens the visible-models modal for a provider (gear icon). */
  onConfigureModels?: (provider: AIProviderType) => void;
}

function ProviderCardCheck() {
  return (
    <CheckCircle2
      aria-hidden
      className="ai-provider-card__check"
    />
  );
}

function ConfiguratorGear({
  provider,
  onConfigureModels,
  label,
}: {
  provider: AIProviderType;
  onConfigureModels: (p: AIProviderType) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="ai-provider-card__gear"
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onConfigureModels(provider);
      }}
    >
      <Settings2 className="size-3" aria-hidden />
    </button>
  );
}

export default function AIProviderSelection({
  provider,
  onProviderChange,
  showSectionLabel = true,
  highlightSelection = true,
  configuredProviders = {},
  onConfigureModels,
}: AIProviderSelectionProps) {
  const { t } = useTranslation();
  const activeProvider = highlightSelection ? provider : null;

  const cloudOptions = AI_PROVIDER_OPTIONS.filter((o) => o.value !== 'dome' && o.value !== 'ollama');
  const configured = cloudOptions.filter((o) => configuredProviders[o.value]);
  const available = cloudOptions.filter((o) => !configuredProviders[o.value]);
  const hasGroups = configured.length > 0 && available.length > 0;

  return (
    // Establish the `ai-settings` container context here so the provider grid's
    // container queries resolve even when there's no AISettingsPanel ancestor.
    <div className="ai-provider-selection">
      {showSectionLabel ? (
        <DomeSectionLabel className="ai-settings__section-label">
          {t('settings.ai.provider')}
        </DomeSectionLabel>
      ) : null}

      <div className="space-y-2">
        {DOME_PROVIDER_ENABLED && (
          <button
            type="button"
            onClick={() => onProviderChange('dome')}
            aria-pressed={activeProvider === 'dome'}
            className={cn(
              'ai-provider-card ai-provider-card--featured',
            )}
          >
            <div className="ai-provider-card__head">
              <div className="ai-provider-card__icon">
                <ProviderBrandIcon provider="dome" size={16} />
              </div>
              <span className="ai-provider-card__name">{PROVIDERS.dome.name}</span>
              <span className="ai-provider-card__badge">{t('settings.ai.recommended')}</span>
              <ProviderCardCheck />
            </div>
            <p className="ai-provider-card__desc">
              {`${PROVIDERS.dome.description}. ${t('settings.ai.no_own_key')}.`}
            </p>
            <div className="ai-provider-card__foot">
              <span className="ai-provider-card__chip">
                <Lock className="size-2.5" aria-hidden />
                {t('settings.ai.private')}
              </span>
              <span className="ai-provider-card__chip">
                <Zap className="size-2.5" aria-hidden />
                {t('settings.ai.fast')}
              </span>
            </div>
          </button>
        )}

        {(hasGroups
          ? [
              { key: 'configured', label: t('settings.ai.providers_configured'), options: configured },
              { key: 'available', label: t('settings.ai.providers_available'), options: available },
            ]
          : [{ key: 'all', label: null, options: cloudOptions }]
        ).map((group) =>
          group.options.length === 0 ? null : (
            <div key={group.key} className="ai-settings__section">
              {group.label ? (
                <DomeSectionLabel className="ai-settings__section-label">{group.label}</DomeSectionLabel>
              ) : null}
              <div className="ai-provider-grid">
                {group.options.map((option) => {
                  const isSelected = activeProvider === option.value;
                  const hasKey = Boolean(configuredProviders[option.value]);
                  const showGear =
                    isVisibleModelsConfigurable(option.value) && Boolean(onConfigureModels);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => !option.disabled && onProviderChange(option.value)}
                      disabled={option.disabled}
                      aria-pressed={isSelected}
                      className="ai-provider-card"
                    >
                      <div className="ai-provider-card__head">
                        <div className="ai-provider-card__icon">
                          <ProviderBrandIcon provider={option.value} size={16} />
                        </div>
                        <span className="ai-provider-card__name">{option.label}</span>
                        {option.badge ? (
                          <span className="ai-provider-card__badge">{option.badge}</span>
                        ) : null}
                        <ProviderCardCheck />
                      </div>
                      <p className="ai-provider-card__desc">
                        {hasKey ? t('settings.ai.key_saved') : t('settings.ai.api_key_required')}
                      </p>
                      <div className="ai-provider-card__foot">
                        <span
                          className={cn(
                            'ai-provider-card__status',
                            hasKey && 'ai-provider-card__status--ok',
                          )}
                        >
                          {hasKey ? (
                            <KeyRound className="size-2.5 shrink-0" aria-hidden />
                          ) : (
                            <Sparkles className="size-2.5 shrink-0" aria-hidden />
                          )}
                          {hasKey ? t('settings.ai.key_saved') : t('settings.ai.api_key_required')}
                        </span>
                        {showGear && onConfigureModels ? (
                          <ConfiguratorGear
                            provider={option.value}
                            onConfigureModels={onConfigureModels}
                            label={t('settings.ai.visible_models.gear_label', { provider: option.label })}
                          />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ),
        )}

        {(() => {
          const ollamaOption = AI_PROVIDER_OPTIONS.find((o) => o.value === 'ollama');
          if (!ollamaOption) return null;
          const isSelected = activeProvider === 'ollama';
          return (
            <button
              type="button"
              aria-label={ollamaOption.label}
              onClick={() => onProviderChange('ollama')}
              aria-pressed={isSelected}
              className="ai-provider-card ai-provider-card--local"
            >
              <div className="ai-provider-card__head">
                <div className="ai-provider-card__icon">
                  <ProviderBrandIcon provider="ollama" size={16} />
                </div>
                <span className="ai-provider-card__name">{ollamaOption.label}</span>
                <span className="ai-provider-card__badge">{t('settings.ai.local_badge')}</span>
                <ProviderCardCheck />
              </div>
              <p className="ai-provider-card__desc">{t('settings.ai.private_local')}</p>
              <div className="ai-provider-card__foot">
                <span className="ai-provider-card__chip">
                  <HardDrive className="size-2.5" aria-hidden />
                  {t('onboarding.offline')}
                </span>
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
    provider === 'qwen' ||
    provider === 'opencode' ||
    provider === 'opencode-go'
  );
}
