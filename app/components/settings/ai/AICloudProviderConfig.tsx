import { HugeiconsIcon } from '@hugeicons/react';
import {
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  Loading03Icon as Loader2,
  RefreshIcon as RefreshCw,
  Alert02Icon as AlertTriangle,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { PROVIDERS, getDefaultModelId, type AIProviderType } from '@/lib/ai/models';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import ModelSelector from '../ModelSelector';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
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
        <label htmlFor="ai-api-key" className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-muted-foreground">
          API Key
        </label>
        <div className="relative w-full">
          <Input className="w-full [&_input]:pr-10 pr-10" id="ai-api-key" type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => onApiKeyChange(e.target.value)} placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || t('onboarding.enter_api_key')} />
          <Button type="button"
  variant="ghost"
  className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
  onClick={() => setShowApiKey((v) => !v)}
  aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
  size="icon-xs">
            {showApiKey ? <HugeiconsIcon icon={EyeOff} className="size-3.5" /> : <HugeiconsIcon icon={Eye} className="size-3.5" />}
          </Button>
        </div>
        {PROVIDERS[provider]?.docsUrl && (
          <p className="text-[11px] mt-1.5 text-muted-foreground">
            {t('settings.ai.free_key_at')}{' '}
            <a
              href={PROVIDERS[provider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80 text-primary"
            >
              {PROVIDERS[provider].docsUrl.replace('https://', '')}
            </a>
          </p>
        )}
      </div>

      {providerModelsLoading ? (
        <p className="text-[11px] flex items-center gap-1.5 text-muted-foreground">
          <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin shrink-0" aria-hidden /> {t('settings.ai.models_loading')}
        </p>
      ) : null}
      {providerModelsError && !providerModelsLoading ? (
        <Alert role="note"><HugeiconsIcon icon={AlertTriangle} aria-hidden /><AlertDescription className="text-xs">{providerModelsError}</AlertDescription></Alert>
      ) : null}

      {currentProviderModels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('settings.ai.model')}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {canRefreshProviderModels ? (
                <Button type="button"
  variant="ghost"
  onClick={() => void refreshProviderModels()}
  disabled={providerModelsLoading || !apiKey.trim()}
  size="xs">{<HugeiconsIcon icon={RefreshCw} className={`size-3 ${providerModelsLoading ? 'animate-spin' : ''}`} aria-hidden />}
                  {t('settings.ai.refresh')}
                </Button>
              ) : null}
              <Button type="button"
  variant="ghost"
  onClick={() => onCustomModelChange(!customModel)}
  size="xs">
                {customModel ? t('settings.ai.use_presets') : t('settings.ai.custom_model')}
              </Button>
            </div>
          </div>
          {customModel ? (
            <Input value={model} onChange={(e) => onModelChange(e.target.value)} placeholder={getDefaultModelId(provider)} autoComplete="off" />
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
              providerId={provider}
              configuredHint
              disabled={providerModelsLoading}
            />
          )}
        </div>
      )}
    </>
  );

  if (!wrapInCard) {
    return <div className="flex flex-col gap-4">{content}</div>;
  }

  return <Card className="p-4 flex flex-col gap-4">{content}</Card>;
}
