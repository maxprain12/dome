import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Eye, EyeOff, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { saveAIConfig } from '@/lib/settings';
import ModelSelector from '../ModelSelector';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeCard from '@/components/ui/DomeCard';
import { DomeInput } from '@/components/ui/DomeInput';

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

  const content = (
    <>
      <div
        className="flex items-center justify-between p-3 rounded-lg"
        style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.status')}
          </span>
          {checkingOllama ? (
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              <Loader2 className="size-3 animate-spin" /> {t('settings.ai.status_checking')}
            </span>
          ) : ollamaAvailable === true ? (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--dome-accent)' }}>
              <CheckCircle2 className="size-3.5" /> {t('settings.ai.status_connected')}
            </span>
          ) : ollamaAvailable === false ? (
            <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--dome-error, #ef4444)' }}>
              <XCircle className="size-3.5" /> {t('settings.ai.status_disconnected')}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('settings.ai.status_unverified')}
            </span>
          )}
        </div>
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void checkOllamaConnection()}
          disabled={checkingOllama}
          leftIcon={<RefreshCw className={`size-3 ${checkingOllama ? 'animate-spin' : ''}`} aria-hidden />}
        >
          {t('settings.ai.test_btn')}
        </DomeButton>
      </div>

      {ollamaAvailable === false ? (
        <DomeCallout tone="warning">
          {t('settings.ai.ollama_install')}{' '}
          <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline font-medium">
            ollama.ai
          </a>
        </DomeCallout>
      ) : null}

      <div>
        <DomeInput
          id="ai-ollama-url"
          label={t('settings.ai.base_url')}
          type="url"
          value={ollamaBaseURL}
          onChange={(e) => onOllamaBaseURLChange(e.target.value)}
          placeholder="http://localhost:11434"
        />
        {showApiKeyField ? (
          <p className="text-[11px] mt-1" style={{ color: 'var(--dome-text-muted)' }}>
            {t('settings.ai.ollama_cloud_hint')}{' '}
            <code className="font-mono">https://api.ollama.com</code>
          </p>
        ) : null}
      </div>

      {showApiKeyField && onOllamaApiKeyChange ? (
        <div>
          <label htmlFor="ai-ollama-api-key" className="block text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--dome-text-muted)]">
            API Key <span className="normal-case font-normal opacity-60">({t('settings.ai.api_key_optional_label')})</span>
          </label>
          <div className="relative w-full">
            <DomeInput
              id="ai-ollama-api-key"
              type={showOllamaApiKey ? 'text' : 'password'}
              value={ollamaApiKey}
              onChange={(e) => onOllamaApiKeyChange(e.target.value)}
              placeholder="ollama_..."
              autoComplete="off"
              inputClassName="pr-10"
              className="w-full [&_input]:pr-10"
            />
            <DomeButton
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => setShowOllamaApiKey((v) => !v)}
              aria-label={showOllamaApiKey ? 'Ocultar' : 'Mostrar'}
            >
              {showOllamaApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </DomeButton>
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--dome-text-muted)]">
            {t('settings.ai.chat_model')}
          </span>
          <DomeButton
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => void loadOllamaModels()}
            disabled={loadingModels}
            leftIcon={<RefreshCw className={`size-2.5 ${loadingModels ? 'animate-spin' : ''}`} aria-hidden />}
          >
            {t('settings.ai.refresh')}
          </DomeButton>
        </div>
        {loadingModels ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: 'var(--dome-bg-hover)' }}>
            <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
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
          />
        ) : (
          <DomeInput value={ollamaModel} onChange={(e) => onOllamaModelChange(e.target.value)} placeholder="llama3.2" />
        )}
      </div>

      {showOcrHint ? (
        <DomeCallout tone="info" title={`${t('settings.ai.ocr_notice')}`}>
          <code className="font-mono">llava</code>, <code className="font-mono">minicpm-v</code>,{' '}
          <code className="font-mono">glm4v</code>.
        </DomeCallout>
      ) : null}
    </>
  );

  if (!wrapInCard) {
    return <div className="space-y-4">{content}</div>;
  }

  return <DomeCard className="space-y-4">{content}</DomeCard>;
}
