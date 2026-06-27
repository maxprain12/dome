import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAIConfig, findModelById, providerSupportsTools, type AIProviderType } from '@/lib/ai';
import { db } from '@/lib/db/client';
import {
  formatPersonalityMemoryBlock,
  loadPersonalityContextFiles,
} from '@/lib/personality/contextFiles';

/**
 * Conversation-level settings for the Many panel (03/T02 — extracted from
 * ManyPanel.tsx). Owns the tool/memory/mcp toggles, the active provider info
 * and the loaders for provider config, MCP-enabled flag and user memory.
 * Pure state container: ManyPanel reads these values and passes the three
 * toggle setters to the composer.
 */
export interface ManyConversationSettings {
  toolsEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  resourceToolsEnabled: boolean;
  setResourceToolsEnabled: (v: boolean) => void;
  memoryEnabled: boolean;
  setMemoryEnabled: (v: boolean) => void;
  mcpEnabled: boolean;
  supportsTools: boolean;
  /** SOUL.md content — preferred static persona when non-empty. */
  soulContent: string;
  userMemory: string;
  providerInfo: string;
  providerId: string;
  budgetCapApprox: number;
}

export function useManyConversationSettings(): ManyConversationSettings {
  const { t } = useTranslation();

  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [mcpEnabled, setMcpEnabledState] = useState(true);
  const [supportsTools, setSupportsTools] = useState(false);
  const [soulContent, setSoulContent] = useState<string>('');
  const [userMemory, setUserMemory] = useState<string>('');
  const [providerInfo, setProviderInfo] = useState<string>('');
  const [providerId, setProviderId] = useState<string>('');
  const [budgetCapApprox, setBudgetCapApprox] = useState(200_000);

  // Active provider info (+ context-window cap), refreshed on config change.
  useEffect(() => {
    const loadProviderInfo = async () => {
      try {
        const config = await getAIConfig();
        if (config?.provider) {
          const model =
            config.provider === 'ollama'
              ? (config.ollamaModel || 'default')
              : (config.model || 'default');
          const displayInfo = model.startsWith(`${config.provider}/`) ? config.provider : `${config.provider} / ${model}`;
          setProviderId(String(config.provider));
          setProviderInfo(displayInfo);
          setSupportsTools(providerSupportsTools(config.provider as AIProviderType));
          const modelId = config.provider === 'ollama' ? config.ollamaModel : config.model;
          const found = modelId ? findModelById(modelId) : undefined;
          setBudgetCapApprox(found?.model.contextWindow ?? 200_000);
        } else {
          setProviderInfo(t('chat.not_configured'));
          setProviderId('');
          setSupportsTools(false);
          setBudgetCapApprox(200_000);
        }
      } catch {
        setProviderInfo(t('chat.not_configured'));
        setProviderId('');
        setSupportsTools(false);
        setBudgetCapApprox(200_000);
      }
    };
    loadProviderInfo();
    const handleConfigChanged = () => loadProviderInfo();
    window.addEventListener('dome:ai-config-changed', handleConfigChanged);
    return () => window.removeEventListener('dome:ai-config-changed', handleConfigChanged);
  }, [t]);

  useEffect(() => {
    const loadMcpEnabled = async () => {
      if (db.isAvailable()) {
        const res = await db.getMcpGlobalEnabled();
        setMcpEnabledState(res.success ? res.data !== false : true);
      }
    };
    loadMcpEnabled();
  }, []);

  useEffect(() => {
    const loadMemory = async () => {
      const files = await loadPersonalityContextFiles();
      setSoulContent(files.soul.trim());
      setUserMemory(formatPersonalityMemoryBlock(files));
    };
    void loadMemory();
  }, []);

  return {
    toolsEnabled,
    setToolsEnabled,
    resourceToolsEnabled,
    setResourceToolsEnabled,
    memoryEnabled,
    setMemoryEnabled,
    mcpEnabled,
    supportsTools,
    soulContent,
    userMemory,
    providerInfo,
    providerId,
    budgetCapApprox,
  };
}
