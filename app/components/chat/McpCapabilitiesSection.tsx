import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plug2 } from 'lucide-react';
import {
  loadMcpServersSetting,
  normalizeMcpServerId,
  saveMcpServersSetting,
  toggleAllGlobalMcpTools,
  toggleGlobalMcpTool,
} from '@/lib/mcp/settings';
import { showToast } from '@/lib/store/useToastStore';
import type { MCPServerConfig } from '@/types';
import { useTranslation } from 'react-i18next';

interface McpCapabilitiesSectionProps {
  serverIds?: string[];
  disabledServerIds?: Set<string>;
  onToggleServer?: (serverId: string) => void;
}

export default function McpCapabilitiesSection({
  serverIds,
  disabledServerIds,
  onToggleServer,
}: McpCapabilitiesSectionProps) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [savingServerId, setSavingServerId] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    const loaded = await loadMcpServersSetting();
    setServers(loaded);
  }, []);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const visibleServers = useMemo(() => {
    if (!Array.isArray(serverIds) || serverIds.length === 0) {
      return servers.filter((server) => server.enabled !== false);
    }

    const normalizedIds = new Set(serverIds.map((serverId) => normalizeMcpServerId(serverId)));
    return servers.filter((server) => normalizedIds.has(normalizeMcpServerId(server.name)));
  }, [serverIds, servers]);

  const persistServers = useCallback(
    async (nextServers: MCPServerConfig[], serverName: string) => {
      const serverId = normalizeMcpServerId(serverName);
      setSavingServerId(serverId);
      setServers(nextServers);
      const result = await saveMcpServersSetting(nextServers);
      if (!result.success) {
        showToast('error', result.error || t('toast.mcp_config_update_error'));
      }
      setSavingServerId(null);
    },
    [t]
  );

  if (visibleServers.length === 0) {
    return (
      <div className="px-1 py-2 text-[12px] leading-relaxed" style={{ color: 'var(--tertiary-text)' }}>
        {t('chat.mcp_no_servers')}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1 py-0.5">
      {visibleServers.map((server) => {
        const normalizedServerId = normalizeMcpServerId(server.name);
        const tools = server.tools ?? [];
        const serverEnabled = disabledServerIds ? !disabledServerIds.has(server.name) : true;
        const isSaving = savingServerId === normalizedServerId;

        return (
          <div
            key={server.name}
            className="min-w-0 rounded-xl border p-3.5"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Plug2 className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--tertiary-text)' }} />
                  <span
                    className="min-w-0 truncate text-[13px] font-medium"
                    style={{ color: 'var(--primary-text)' }}
                    title={server.name}
                  >
                    {server.name}
                  </span>
                </div>
                <div
                  className="mt-1 break-words text-[10px] leading-snug"
                  style={{ color: 'var(--tertiary-text)', overflowWrap: 'anywhere' }}
                >
                  {tools.length > 0
                    ? t('chat.mcp_tools_active', {
                        active: tools.filter((tool) => tool.enabled !== false).length,
                        total: tools.length,
                      })
                    : t('chat.mcp_no_discovered')}
                </div>
              </div>
              {onToggleServer ? (
                <button
                  type="button"
                  onClick={() => onToggleServer(server.name)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium"
                  style={{
                    borderColor: 'var(--border)',
                    color: serverEnabled ? 'var(--primary-text)' : 'var(--tertiary-text)',
                    backgroundColor: serverEnabled ? 'var(--bg-tertiary)' : 'transparent',
                  }}
                >
                  {serverEnabled ? t('agent.active') : t('agent.inactive')}
                </button>
              ) : null}
            </div>

            {tools.length > 0 ? (
              <div className="mt-3.5">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--tertiary-text)' }}
                  >
                    {t('chat.tools_section')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        persistServers(
                          servers.map((currentServer) =>
                            currentServer.name === server.name
                              ? toggleAllGlobalMcpTools(currentServer, true)
                              : currentServer
                          ),
                          server.name
                        )
                      }
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: 'var(--translucent)', color: 'var(--accent)' }}
                    >
                      {t('chat.mcp_all')}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        persistServers(
                          servers.map((currentServer) =>
                            currentServer.name === server.name
                              ? toggleAllGlobalMcpTools(currentServer, false)
                              : currentServer
                          ),
                          server.name
                        )
                      }
                      className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                      style={{ borderColor: 'var(--border)', color: 'var(--tertiary-text)' }}
                    >
                      {t('chat.mcp_none')}
                    </button>
                  </div>
                </div>
                <div className="max-h-[min(220px,40vh)] space-y-2 overflow-y-auto pr-0.5">
                  {tools.map((tool) => {
                    const toolId = tool.id || tool.name;
                    return (
                      <label
                        key={toolId}
                        className="block cursor-pointer"
                      >
                        <div
                          className="flex items-start justify-between gap-2.5 rounded-xl border border-transparent bg-[var(--bg-tertiary)] p-2.5 transition-colors hover:border-[var(--border)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate text-[12px] font-medium"
                              style={{ color: 'var(--primary-text)' }}
                              title={tool.name}
                            >
                              {tool.name}
                            </div>
                            {tool.description ? (
                              <p
                                className="mt-1 line-clamp-3 text-[11px] leading-relaxed"
                                style={{ color: 'var(--tertiary-text)' }}
                                title={tool.description}
                              >
                                {tool.description}
                              </p>
                            ) : null}
                          </div>
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0 rounded accent-[var(--accent)]"
                            aria-label={tool.name}
                            checked={tool.enabled !== false}
                            disabled={isSaving}
                            onChange={(event) =>
                              persistServers(
                                servers.map((currentServer) =>
                                  currentServer.name === server.name
                                    ? toggleGlobalMcpTool(
                                        currentServer,
                                        toolId,
                                        event.target.checked
                                      )
                                    : currentServer
                                ),
                                server.name
                              )
                            }
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--tertiary-text)' }}>
                {t('chat.mcp_settings_hint')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
