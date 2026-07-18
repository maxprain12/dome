import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  EyeIcon,
  EyeOffIcon,
  InformationCircleIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { saveAIConfig } from '@/lib/settings';
import { resolveOllamaMode } from '@/lib/ai/providerAuth';
import ModelSelector from '../ModelSelector';
import { cn } from '@/lib/utils';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface AIOllamaProviderConfigProps {
  ollamaBaseURL: string;
  onOllamaBaseURLChange: (value: string) => void;
  ollamaModel: string;
  onOllamaModelChange: (value: string) => void;
  ollamaApiKey?: string;
  onOllamaApiKeyChange?: (value: string) => void;
  showApiKeyField?: boolean;
  showOcrHint?: boolean;
  wrapInCard?: boolean;
  onAvailabilityChange?: (available: boolean | null) => void;
}

/** Ollama endpoint config: availability check, base URL (local/cloud), key and model. */
export default function AIOllamaProviderConfig({
  ollamaBaseURL,
  onOllamaBaseURLChange,
  ollamaModel,
  onOllamaModelChange,
  ollamaApiKey = '',
  onOllamaApiKeyChange,
  showApiKeyField = true,
  showOcrHint = true,
  wrapInCard = true,
  onAvailabilityChange,
}: AIOllamaProviderConfigProps) {
  const { t } = useTranslation();
  const [showOllamaApiKey, setShowOllamaApiKey] = useState(false);
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const checkOllamaConnection = useCallback(async () => {
    if (!window.electron) return;
    setCheckingOllama(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.checkAvailability();
      const available = result.success && result.available === true;
      setOllamaAvailable(available);
      onAvailabilityChange?.(available);
    } catch {
      setOllamaAvailable(false);
      onAvailabilityChange?.(false);
    } finally {
      setCheckingOllama(false);
    }
  }, [ollamaBaseURL, onAvailabilityChange]);

  const loadOllamaModels = useCallback(async () => {
    if (!window.electron) return;
    setLoadingModels(true);
    try {
      await saveAIConfig({ ollama_base_url: ollamaBaseURL });
      const result = await window.electron.ollama.listModels();
      setOllamaModels(result.success && Array.isArray(result.models) ? result.models : []);
    } catch {
      setOllamaModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, [ollamaBaseURL]);

  useEffect(() => {
    void checkOllamaConnection();
    void loadOllamaModels();
  }, [checkOllamaConnection, loadOllamaModels]);

  const ollamaMode = resolveOllamaMode(ollamaBaseURL);
  const apiKeyIsRequired = ollamaMode === 'cloud';

  return (
    <div className={cn('flex flex-col gap-4', wrapInCard && 'rounded-xl border bg-card p-4')}>
      <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('settings.ai.status')}
          </span>
          {checkingOllama ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Spinner /> {t('settings.ai.status_checking')}
            </span>
          ) : ollamaAvailable === true ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} /> {t('settings.ai.status_connected')}
            </span>
          ) : ollamaAvailable === false ? (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <HugeiconsIcon icon={CancelCircleIcon} /> {t('settings.ai.status_disconnected')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t('settings.ai.status_unverified')}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void checkOllamaConnection()}
          disabled={checkingOllama}
        >
          {checkingOllama ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
          )}
          {t('settings.ai.test_btn')}
        </Button>
      </div>

      {ollamaAvailable === false ? (
        <Alert role="note">
          <HugeiconsIcon icon={Alert02Icon} aria-hidden />
          <AlertDescription className="text-xs">
            {t('settings.ai.ollama_install')}{' '}
            <a
              href="https://ollama.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              ollama.ai
            </a>
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        <div className="flex items-end gap-3">
          <Field className="flex-1">
            <FieldLabel htmlFor="ai-ollama-url">{t('settings.ai.base_url')}</FieldLabel>
            <Input
              id="ai-ollama-url"
              type="url"
              value={ollamaBaseURL}
              onChange={(e) => onOllamaBaseURLChange(e.target.value)}
              placeholder="http://localhost:11434"
            />
          </Field>
          <Badge
            variant={apiKeyIsRequired ? 'outline' : 'secondary'}
            className={cn('mb-2 shrink-0', !apiKeyIsRequired && 'text-primary')}
          >
            {apiKeyIsRequired ? t('settings.ai.ollama_mode_cloud') : t('settings.ai.ollama_mode_local')}
          </Badge>
        </div>
        {showApiKeyField ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {apiKeyIsRequired ? (
              <>
                {t('settings.ai.ollama_cloud_hint')}{' '}
                <code className="font-mono">https://api.ollama.com</code>
              </>
            ) : (
              t('settings.ai.ollama_local_hint')
            )}
          </p>
        ) : null}
      </div>

      {showApiKeyField && onOllamaApiKeyChange ? (
        <Field>
          <FieldLabel htmlFor="ai-ollama-api-key">
            API Key{' '}
            <span className="font-normal normal-case opacity-60">
              (
              {apiKeyIsRequired
                ? t('settings.ai.api_key_required_label')
                : t('settings.ai.api_key_optional_label')}
              )
            </span>
          </FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="ai-ollama-api-key"
              type={showOllamaApiKey ? 'text' : 'password'}
              value={ollamaApiKey}
              onChange={(e) => onOllamaApiKeyChange(e.target.value)}
              placeholder="ollama_..."
              autoComplete="off"
            />
            <InputGroupAddon align="inline-end">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowOllamaApiKey((v) => !v)}
                aria-label={showOllamaApiKey ? 'Ocultar' : 'Mostrar'}
              >
                <HugeiconsIcon icon={showOllamaApiKey ? EyeOffIcon : EyeIcon} />
              </Button>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('settings.ai.chat_model')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void loadOllamaModels()}
            disabled={loadingModels}
          >
            <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" />
            {t('settings.ai.refresh')}
          </Button>
        </div>
        {loadingModels ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
            <Spinner className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('settings.ai.loading_models')}</span>
          </div>
        ) : ollamaModels.length > 0 ? (
          <ModelSelector
            models={ollamaModels.map((m) => ({
              id: m.name,
              name: m.name,
              description: `${Math.round(m.size / 1024 / 1024 / 1024)}GB`,
              reasoning: false,
              input: ['text'],
              contextWindow: 0,
              maxTokens: 0,
            }))}
            selectedModelId={ollamaModel}
            onChange={onOllamaModelChange}
            searchable
            showBadges={false}
            showDescription
            showContextWindow={false}
            placeholder={t('settings.ai.chat_model')}
            disabled={loadingModels}
            providerType="ollama"
            providerId="ollama"
          />
        ) : (
          <Input
            value={ollamaModel}
            onChange={(e) => onOllamaModelChange(e.target.value)}
            placeholder="llama3.2"
            aria-label={t('settings.ai.chat_model')}
          />
        )}
      </div>

      {showOcrHint ? (
        <Alert role="note">
          <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
          <AlertTitle className="text-xs">{t('settings.ai.ocr_notice')}</AlertTitle>
          <AlertDescription className="text-xs">
            <code className="font-mono">llava</code>, <code className="font-mono">minicpm-v</code>,{' '}
            <code className="font-mono">glm4v</code>.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
