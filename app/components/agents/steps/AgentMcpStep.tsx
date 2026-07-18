'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  Plug02Icon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import {
  loadMcpServersSetting,
  saveMcpServersSetting,
  toggleAllGlobalMcpTools,
  toggleGlobalMcpTool,
} from '@/lib/mcp/settings';
import { showToast } from '@/lib/store/useToastStore';
import type { MCPServerConfig } from '@/types';
import { useTranslation } from 'react-i18next';

interface AgentMcpStepProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

function applyGlobalToolToggle(
  servers: MCPServerConfig[],
  targetName: string,
  toolId: string,
  enabled: boolean,
): MCPServerConfig[] {
  return servers.map((server) =>
    server.name === targetName
      ? toggleGlobalMcpTool(server, toolId, enabled)
      : server,
  );
}

export default function AgentMcpStep({ selectedIds, onChange }: AgentMcpStepProps) {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingServerName, setSavingServerName] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      setServers(await loadMcpServersSetting());
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const selectedSet = new Set(selectedIds);

  const toggle = (name: string) => {
    if (selectedSet.has(name)) {
      onChange(selectedIds.filter((x) => x !== name));
    } else {
      onChange([...selectedIds, name]);
    }
  };

  const persistServers = async (nextServers: MCPServerConfig[], serverName: string) => {
    setSavingServerName(serverName);
    setServers(nextServers);
    const result = await saveMcpServersSetting(nextServers);
    if (!result.success) {
      showToast('error', result.error || t('toast.mcp_config_update_error'));
    }
    setSavingServerName(null);
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargando servidores MCP...
      </p>
    );
  }

  if (servers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay servidores MCP configurados. Añade MCPs en Ajustes → MCP para que estén disponibles aquí.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-y-3">
      <p className="text-xs text-muted-foreground">
        Elige qué servidores MCP puede usar este agente. Las tools de cada MCP se activan globalmente aquí mismo y se comparten con Many y los equipos.
      </p>
      <div className="flex flex-col gap-y-2 max-h-[28rem] overflow-y-auto pr-1">
        {servers.map((s) => (
          <div
            key={s.name}
            className="rounded-xl border p-3"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
          >
            <label htmlFor={`agent-mcp-server-${s.name}`} aria-label={s.name} className="flex items-start gap-3 cursor-pointer">
              <input
                id={`agent-mcp-server-${s.name}`}
                type="checkbox"
                checked={selectedSet.has(s.name)}
                onChange={() => toggle(s.name)}
                className="rounded mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={Plug02Icon} className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">
                    {s.name}
                  </span>
                  {selectedSet.has(s.name) ? (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)' }}>
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
                      Activo en este agente
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Array.isArray(s.tools) && s.tools.length > 0
                    ? `${s.tools.filter((tool) => tool.enabled !== false).length}/${s.tools.length} tools activas globalmente`
                    : 'Aún no hay tools descubiertas. Usa Ajustes > MCP para probar y descubrir tools.'}
                </p>
              </div>
            </label>

            {Array.isArray(s.tools) && s.tools.length > 0 ? (
              <div className="mt-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--background)' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Selector global de tools
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        persistServers(
                          servers.map((server) => server.name === s.name ? toggleAllGlobalMcpTools(server, true) : server),
                          s.name
                        )
                      }
                      disabled={savingServerName === s.name}
                      className="rounded px-2 py-1 text-[10px] font-medium"
                      style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--primary)' }}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        persistServers(
                          servers.map((server) => server.name === s.name ? toggleAllGlobalMcpTools(server, false) : server),
                          s.name
                        )
                      }
                      disabled={savingServerName === s.name}
                      className="rounded px-2 py-1 text-[10px] font-medium border"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                    >
                      Ninguna
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-y-1.5">
                  {s.tools.map((tool) => (
                    <label
                      key={tool.id}
                      htmlFor={`agent-mcp-tool-${s.name}-${String(tool.id ?? tool.name)}`}
                      className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-foreground">
                          {tool.name}
                        </div>
                        {tool.description ? (
                          <div className="text-[10px] mt-0.5 text-muted-foreground">
                            {tool.description}
                          </div>
                        ) : null}
                      </div>
                      <input
                        id={`agent-mcp-tool-${s.name}-${String(tool.id ?? tool.name)}`}
                        type="checkbox"
                        className="rounded mt-0.5"
                        checked={tool.enabled !== false}
                        disabled={savingServerName === s.name}
                        onChange={(event) =>
                          persistServers(
                            applyGlobalToolToggle(
                              servers,
                              s.name,
                              tool.id || tool.name,
                              event.target.checked,
                            ),
                            s.name,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
