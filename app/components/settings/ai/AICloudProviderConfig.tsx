import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Loader2, RefreshCw } from 'lucide-react';
import { PROVIDERS, getDefaultModelId, type AIProviderType } from '@/lib/ai/models';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import ModelSelector from '../ModelSelector';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeCard from '@/components/ui/DomeCard';
import { DomeInput } from '@/components/ui/DomeInput';

export interface AICloudProviderConfigProps {
  provider: AIProviderType;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  customModel: boolean;
  onCustomModelChange: (value: boolean) => void;
  /** Onboarding: simpler model selector without full descriptions */
  compact?: boolean;
  wrapInCard?: boolean;
}

export default function AICloudProviderConfig({
  provider,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  customModel,
  onCustomModelChange,
  compact = false,
  wrapInCard = true,
}: AICloudProviderConfigProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);

  const {
    models: currentProviderModels,
    loading: providerModelsLoading,
    error: providerModelsError,
    refresh: refreshProviderModels,
    canRefresh: canRefreshProviderModels,
  } = useProviderModels({ provider, apiKey });

  const content = (
    <>
      <div>
        <label htmlFor="ai-api-key" className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]">
          API Key
        </label>
        <div className="relative w-full">
          <DomeInput
            id="ai-api-key"
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || t('onboarding.enter_api_key')}
            inputClassName="pr-10"
            className="w-full [&_input]:pr-10"
          />
          <DomeButton
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[var(--dome-text-muted)]"
            onClick={() => setShowApiKey((v) => !v)}
            aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
          >
            {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </DomeButton>
        </div>
        {PROVIDERS[provider]?.docsUrl && (
          <p className="text-[11px] mt-1.5" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.free_key_at')}{' '}
            <a
              href={PROVIDERS[provider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
              style={{ color: 'var(--dome-accent)' }}
            >
              {PROVIDERS[provider].docsUrl.replace('https://', '')}
            </a>
          </p>
        )}
      </div>

      {providerModelsLoading ? (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--dome-text-muted)' }}>
          <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden /> {t('settings.ai.models_loading')}
        </p>
      ) : null}
      {providerModelsError && !providerModelsLoading ? (
        <DomeCallout tone="warning">{providerModelsError}</DomeCallout>
      ) : null}

      {currentProviderModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--dome-text-muted)]">
              {t('settings.ai.model')}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {canRefreshProviderModels ? (
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void refreshProviderModels()}
                  disabled={providerModelsLoading || !apiKey.trim()}
                  leftIcon={<RefreshCw className={`size-3 ${providerModelsLoading ? 'animate-spin' : ''}`} aria-hidden />}
                >
                  {t('settings.ai.refresh')}
                </DomeButton>
              ) : null}
              <DomeButton type="button" variant="ghost" size="xs" onClick={() => onCustomModelChange(!customModel)}>
                {customModel ? t('settings.ai.use_presets') : t('settings.ai.custom_model')}
              </DomeButton>
            </div>
          </div>
          {customModel ? (
            <DomeInput
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={getDefaultModelId(provider)}
              autoComplete="off"
            />
          ) : (
            <ModelSelector
              models={currentProviderModels}
              selectedModelId={model}
              onChange={onModelChange}
              showBadges={true}
              showDescription={!compact}
              showContextWindow={!compact}
              searchable={currentProviderModels.length > 5}
              placeholder={t('settings.ai.model')}
              providerType="cloud"
              disabled={providerModelsLoading}
            />
          )}
        </div>
      )}
    </>
  );

  if (!wrapInCard) {
    return <div className="space-y-4">{content}</div>;
  }

  return <DomeCard className="space-y-4">{content}</DomeCard>;
}
