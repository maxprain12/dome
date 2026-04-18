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
      <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--dome-text-muted)' }}>
        No hay MCPs configurados con tools disponibles.
      </div>
    );
  }

  return (
      <div className="space-y-3 px-3 py-1">
      {visibleServers.map((server) => {
        const normalizedServerId = normalizeMcpServerId(server.name);
        const tools = server.tools ?? [];
        const serverEnabled = disabledServerIds ? !disabledServerIds.has(server.name) : true;
        const isSaving = savingServerId === normalizedServerId;

        return (
          <div key={server.name} className="min-w-0 rounded-lg border p-2.5" style={{ borderColor: 'var(--dome-border)', backgroundColor: 'var(--dome-bg)' }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Plug2 className="w-3.5 h-3.5" style={{ color: 'var(--dome-text-muted)' }} />
                  <span className="break-words text-[12px] font-medium" style={{ color: 'var(--dome-text)', overflowWrap: 'anywhere' }}>
                    {server.name}
                  </span>
                </div>
                <div className="mt-0.5 break-words text-[10px]" style={{ color: 'var(--dome-text-muted)', overflowWrap: 'anywhere' }}>
                  {tools.length > 0
                    ? `${tools.filter((tool) => tool.enabled !== false).length}/${tools.length} tools globales activas`
                    : 'Sin tools descubiertas todavía'}
                </div>
              </div>
              {onToggleServer ? (
                <button
                  type="button"
                  onClick={() => onToggleServer(server.name)}
                  className="rounded px-2 py-1 text-[10px] font-medium border"
                  style={{
                    borderColor: 'var(--dome-border)',
                    color: serverEnabled ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                    backgroundColor: serverEnabled ? 'var(--dome-surface)' : 'transparent',
                  }}
                >
                  {serverEnabled ? 'Activo' : 'Inactivo'}
                </button>
              ) : null}
            </div>

            {tools.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
                    Tools
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
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ backgroundColor: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
                    >
                      Todas
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
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium border"
                      style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                    >
                      Ninguna
                    </button>
                  </div>
                </div>
                {tools.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-[var(--dome-surface)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[12px]" style={{ color: 'var(--dome-text)', overflowWrap: 'anywhere' }}>
                        {tool.name}
                      </div>
                      {tool.description ? (
                        <div className="mt-0.5 break-words text-[10px] leading-4" style={{ color: 'var(--dome-text-muted)', overflowWrap: 'anywhere' }}>
                          {tool.description}
                        </div>
                      ) : null}
                    </div>
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded shrink-0"
                      checked={tool.enabled !== false}
                      disabled={isSaving}
                      onChange={(event) =>
                        persistServers(
                          servers.map((currentServer) =>
                            currentServer.name === server.name
                              ? toggleGlobalMcpTool(currentServer, tool.id || tool.name, event.target.checked)
                              : currentServer
                          ),
                          server.name
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                Descubre las tools desde Ajustes &gt; MCP o probando este servidor allí.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
