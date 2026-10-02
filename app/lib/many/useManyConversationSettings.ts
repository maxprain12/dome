import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAIConfig, findModelById, providerSupportsTools, type AIProviderType } from '@/lib/ai';
import { fallbackContextWindow, parseContextWindow, readPersistedContextWindow } from '@/lib/ai/context-window';
import { db } from '@/lib/db/client';
import { memoryPolicy } from '@/lib/personality/memory-policy';
import { useManyStore } from '@/lib/store/useManyStore';
import { showToast } from '@/lib/store/useToastStore';
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
  const conversationId = useManyStore((s) => s.currentSessionId);

  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [resourceToolsEnabled, setResourceToolsEnabled] = useState(true);
  const [memoryEnabled, setMemoryEnabledState] = useState(true);
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
          const modelId = config.provider === 'ollama' ? config.ollamaModel : config.model;
          const capabilities = modelId && window.electron
            ? await window.electron.invoke('ai:model:input', { provider: config.provider, model: modelId })
            : null;
          setSupportsTools(capabilities?.success && typeof capabilities.supportsTools === 'boolean'
            ? capabilities.supportsTools : providerSupportsTools(config.provider as AIProviderType));
          const found = modelId ? findModelById(modelId) : undefined;
          const fromCatalog = parseContextWindow(found?.model.contextWindow);
          const persisted = await readPersistedContextWindow(String(config.provider));
          setBudgetCapApprox(parseContextWindow(capabilities?.contextWindow) || fromCatalog || persisted || fallbackContextWindow(String(config.provider)));
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

  const setMemoryEnabled = (enabled: boolean) => {
    void memoryPolicy(conversationId || undefined, enabled).then((policy) => setMemoryEnabledState(policy.enabled))
      .catch((error) => showToast('error', error.message));
  };
  useEffect(() => {
    let cancelled = false;
    const loadMemory = async () => {
      const policy = await memoryPolicy(conversationId || undefined);
      const response = await window.electron.personality.getAgentMemoryContext({ conversationId: conversationId || undefined,
        projectId, includeProject: true, includeDomains: [] });
      if (!response.success) throw new Error(response.error);
      if (cancelled) return;
      setMemoryEnabledState(policy.enabled);
      setSoulContent(response.data?.soul || '');
      setUserMemory(response.data?.volatileMemory || '');
    };
    const refresh = () => { void loadMemory().catch((error) => {
      if (!cancelled) { setUserMemory(''); showToast('error', error.message); }
    }); };
    refresh();
    window.addEventListener('dome:memory-policy-changed', refresh);
    return () => { cancelled = true; window.removeEventListener('dome:memory-policy-changed', refresh); };
  }, [conversationId, projectId]);

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
