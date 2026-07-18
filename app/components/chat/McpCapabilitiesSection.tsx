import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Plug02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
      <div className="px-1 py-2 text-[12px] leading-relaxed text-muted-foreground">
        {t('chat.mcp_no_servers')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-y-4 px-1 py-0.5">
      {visibleServers.map((server) => {
        const normalizedServerId = normalizeMcpServerId(server.name);
        const tools = server.tools ?? [];
        const serverEnabled = disabledServerIds ? !disabledServerIds.has(server.name) : true;
        const isSaving = savingServerId === normalizedServerId;

        return (
          <Card
            key={server.name}
            className="min-w-0 gap-3 py-3.5"
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 px-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={Plug02Icon} className="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className="min-w-0 truncate text-[13px] font-medium text-foreground"
                    title={server.name}
                  >
                    {server.name}
                  </span>
                </div>
                <div className="mt-1 break-words text-[10px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
                  {tools.length > 0
                    ? t('chat.mcp_tools_active', {
                        active: tools.filter((tool) => tool.enabled !== false).length,
                        total: tools.length,
                      })
                    : t('chat.mcp_no_discovered')}
                </div>
              </div>
              {onToggleServer ? (
                <Button
                  type="button"
                  variant={serverEnabled ? 'secondary' : 'outline'}
                  size="xs"
                  onClick={() => onToggleServer(server.name)}
                  className="shrink-0 text-[10px]"
                >
                  {serverEnabled ? t('agent.active') : t('agent.inactive')}
                </Button>
              ) : null}
            </CardHeader>

            {tools.length > 0 ? (
              <CardContent className="px-3.5">
                <div className="flex items-center justify-between gap-2 pb-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {t('chat.tools_section')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
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
                      className="text-[10px] text-primary"
                    >
                      {t('chat.mcp_all')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
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
                      className="text-[10px] text-muted-foreground"
                    >
                      {t('chat.mcp_none')}
                    </Button>
                  </div>
                </div>
                <div className="max-h-[min(220px,40vh)] flex flex-col gap-y-2 overflow-y-auto pr-0.5">
                  {tools.map((tool) => {
                    const toolId = tool.id || tool.name;
                    return (
                      <div
                        key={toolId}
                        className="flex items-start justify-between gap-2.5 rounded-xl border border-transparent bg-muted p-2.5 transition-colors hover:border-border"
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className="truncate text-[12px] font-medium text-foreground"
                            title={tool.name}
                          >
                            {tool.name}
                          </div>
                          {tool.description ? (
                            <p
                              className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground"
                              title={tool.description}
                            >
                              {tool.description}
                            </p>
                          ) : null}
                        </div>
                        <Checkbox
                          className="mt-0.5 shrink-0"
                          aria-label={tool.name}
                          checked={tool.enabled !== false}
                          disabled={isSaving}
                          onCheckedChange={(checked) =>
                            persistServers(
                              servers.map((currentServer) =>
                                currentServer.name === server.name
                                  ? toggleGlobalMcpTool(
                                      currentServer,
                                      toolId,
                                      checked === true
                                    )
                                  : currentServer
                              ),
                              server.name
                            )
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            ) : (
              <CardContent className="px-3.5 text-[10px] leading-relaxed text-muted-foreground">
                {t('chat.mcp_settings_hint')}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
