import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon as CheckCircle2,
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  Loading03Icon as Loader2,
  RefreshIcon as RefreshCw,
  CancelCircleIcon as XCircle,
  Alert02Icon as AlertTriangle,
  InformationCircleIcon as Info,
} from '@hugeicons/core-free-icons';
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { saveAIConfig } from '@/lib/settings';
import { resolveOllamaMode } from '@/lib/ai/providerAuth';
import ModelSelector from '../ModelSelector';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
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

  const content = (
    <>
      <div
        className="flex items-center justify-between rounded-lg border bg-accent p-3"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings.ai.status')}
          </span>
          {checkingOllama ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Loader2} className="size-3 animate-spin" /> {t('settings.ai.status_checking')}
            </span>
          ) : ollamaAvailable === true ? (
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <HugeiconsIcon icon={CheckCircle2} className="size-3.5" /> {t('settings.ai.status_connected')}
            </span>
          ) : ollamaAvailable === false ? (
            <span className="flex items-center gap-1 text-xs font-medium text-destructive">
              <HugeiconsIcon icon={XCircle} className="size-3.5" /> {t('settings.ai.status_disconnected')}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t('settings.ai.status_unverified')}
            </span>
          )}
        </div>
        <Button type="button"
  onClick={() => void checkOllamaConnection()}
  disabled={checkingOllama}
  size="sm">{<HugeiconsIcon icon={RefreshCw} className={`size-3 ${checkingOllama ? 'animate-spin' : ''}`} aria-hidden />}
          {t('settings.ai.test_btn')}
        </Button>
      </div>

      {ollamaAvailable === false ? (
        <Alert role="note"><HugeiconsIcon icon={AlertTriangle} aria-hidden /><AlertDescription className="text-xs">
          {t('settings.ai.ollama_install')}{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            ollama.ai
          </a>
        </AlertDescription></Alert>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Field className="gap-1.5 flex-1"><FieldLabel htmlFor="ai-ollama-url" className="text-xs">{t('settings.ai.base_url')}</FieldLabel><Input id="ai-ollama-url" type="url" value={ollamaBaseURL} onChange={(e) => onOllamaBaseURLChange(e.target.value)} placeholder="http://localhost:11434" /></Field>
          <Badge
            variant={apiKeyIsRequired ? 'outline' : 'secondary'}
            className={apiKeyIsRequired ? 'ml-3 mt-5 shrink-0 text-muted-foreground' : 'ml-3 mt-5 shrink-0 text-primary'}
          >
            {apiKeyIsRequired ? t('settings.ai.ollama_mode_cloud') : t('settings.ai.ollama_mode_local')}
          </Badge>
        </div>
        {showApiKeyField ? (
          <p className="text-[11px] mt-1 text-muted-foreground">
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
        <div>
          <label htmlFor="ai-ollama-api-key" className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-muted-foreground">
            API Key{' '}
            <span className="normal-case font-normal opacity-60">
              ({apiKeyIsRequired ? t('settings.ai.api_key_required_label') : t('settings.ai.api_key_optional_label')})
            </span>
          </label>
          <div className="relative w-full">
            <Input className="w-full [&_input]:pr-10 pr-10" id="ai-ollama-api-key" type={showOllamaApiKey ? 'text' : 'password'} value={ollamaApiKey} onChange={(e) => onOllamaApiKeyChange(e.target.value)} placeholder="ollama_..." autoComplete="off" />
            <Button type="button"
  variant="ghost"
  className="absolute right-1 top-1/2 -translate-y-1/2"
  onClick={() => setShowOllamaApiKey((v) => !v)}
  aria-label={showOllamaApiKey ? 'Ocultar' : 'Mostrar'}
  size="icon-xs">
              {showOllamaApiKey ? <HugeiconsIcon icon={EyeOff} className="size-3.5" /> : <HugeiconsIcon icon={Eye} className="size-3.5" />}
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('settings.ai.chat_model')}
          </span>
          <Button type="button"
  variant="ghost"
  onClick={() => void loadOllamaModels()}
  disabled={loadingModels}
  size="xs">{<HugeiconsIcon icon={RefreshCw} className={`size-2.5 ${loadingModels ? 'animate-spin' : ''}`} aria-hidden />}
            {t('settings.ai.refresh')}
          </Button>
        </div>
        {loadingModels ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent">
            <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {t('settings.ai.loading_models')}
            </span>
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
            searchable={true}
            showBadges={false}
            showDescription={true}
            showContextWindow={false}
            placeholder={t('settings.ai.chat_model')}
            disabled={loadingModels}
            providerType="ollama"
            providerId="ollama"
          />
        ) : (
          <Input value={ollamaModel} onChange={(e) => onOllamaModelChange(e.target.value)} placeholder="llama3.2" />
        )}
      </div>

      {showOcrHint ? (
        <Alert role="note"><HugeiconsIcon icon={Info} aria-hidden /><AlertTitle className="text-xs">{`${t('settings.ai.ocr_notice')}`}</AlertTitle><AlertDescription className="text-xs">
          <code className="font-mono">llava</code>, <code className="font-mono">minicpm-v</code>,{' '}
          <code className="font-mono">glm4v</code>.
        </AlertDescription></Alert>
      ) : null}
    </>
  );

  if (!wrapInCard) {
    return <div className="flex flex-col gap-4">{content}</div>;
  }

  return <Card className="p-4 flex flex-col gap-4">{content}</Card>;
}
