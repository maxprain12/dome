import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAIConfig, findModelById, providerSupportsTools, type AIProviderType } from '@/lib/ai';
import { db } from '@/lib/db/client';
import {
  formatPersonalityMemoryBlock,
  loadPersonalityContextFiles,
} from '@/lib/personality/contextFiles';
import { useAppStore } from '@/lib/store/useAppStore';

/**
 * Conversation-level settings for the Many panel. Owns the tool/memory/mcp
 * toggles, the active provider info and the loaders for provider config,
 * MCP-enabled flag and user memory. Pure state container: the panel reads
 * these values and passes the toggle setters to the composer/context views.
 *
 * `memoryEnabled=false` clears the LTM volatile block and (in useManySend)
 * omits the remember_fact tool — soul persona stays loaded.
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
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');

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

      if (!memoryEnabled) {
        setUserMemory('');
        return;
      }

      const invoke = window.electron?.personality?.getAgentMemoryContext;
      if (invoke) {
        try {
          const res = await invoke({
            memoryEnabled: true,
            projectId,
            includeProject: true,
            includeDomains: [],
          });
          if (res?.success && res.data?.volatileMemory) {
            setUserMemory(res.data.volatileMemory);
            return;
          }
        } catch {
          /* fall through to local format */
        }
      }

      setUserMemory(formatPersonalityMemoryBlock(files));
    };
    void loadMemory();
  }, [memoryEnabled, projectId]);

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
