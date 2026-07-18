import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, EyeIcon, EyeOffIcon, RefreshIcon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PROVIDERS, getDefaultModelId, type AIProviderType } from '@/lib/ai/models';
import { useProviderModels } from '@/lib/ai/useProviderModels';
import ModelSelector from '../ModelSelector';
import { cn } from '@/lib/utils';

export interface AICloudProviderConfigProps {
  provider: AIProviderType;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  customModel: boolean;
  onCustomModelChange: (value: boolean) => void;
  /** Onboarding: simpler model selector without full descriptions. */
  compact?: boolean;
  wrapInCard?: boolean;
}

/** API key + model choice for a cloud provider (used by Settings → AI and onboarding). */
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

  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        wrapInCard && 'rounded-xl border bg-card p-4',
      )}
    >
      <Field>
        <FieldLabel htmlFor="ai-api-key">API Key</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="ai-api-key"
            type={showApiKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder={PROVIDERS[provider]?.apiKeyPlaceholder || t('onboarding.enter_api_key')}
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              onClick={() => setShowApiKey((v) => !v)}
              aria-label={showApiKey ? 'Ocultar API key' : 'Mostrar API key'}
            >
              <HugeiconsIcon icon={showApiKey ? EyeOffIcon : EyeIcon} />
            </Button>
          </InputGroupAddon>
        </InputGroup>
        {PROVIDERS[provider]?.docsUrl ? (
          <p className="text-[11px] text-muted-foreground">
            {t('settings.ai.free_key_at')}{' '}
            <a
              href={PROVIDERS[provider].docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-80"
            >
              {PROVIDERS[provider].docsUrl.replace('https://', '')}
            </a>
          </p>
        ) : null}
      </Field>

      {providerModelsLoading ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Spinner /> {t('settings.ai.models_loading')}
        </p>
      ) : null}
      {providerModelsError && !providerModelsLoading ? (
        <Alert role="note">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="text-xs">{providerModelsError}</AlertDescription>
        </Alert>
      ) : null}

      {currentProviderModels.length > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('settings.ai.model')}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {canRefreshProviderModels ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => void refreshProviderModels()}
                  disabled={providerModelsLoading || !apiKey.trim()}
                >
                  <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
                  {t('settings.ai.refresh')}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onCustomModelChange(!customModel)}
              >
                {customModel ? t('settings.ai.use_presets') : t('settings.ai.custom_model')}
              </Button>
            </div>
          </div>
          {customModel ? (
            <Input
              value={model}
              onChange={(e) => onModelChange(e.target.value)}
              placeholder={getDefaultModelId(provider)}
              autoComplete="off"
              aria-label={t('settings.ai.model')}
            />
          ) : (
            <ModelSelector
              models={currentProviderModels}
              selectedModelId={model}
              onChange={onModelChange}
              showBadges
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
      ) : null}
    </div>
  );
}
