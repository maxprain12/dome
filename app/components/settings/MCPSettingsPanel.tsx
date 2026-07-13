import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlusSignIcon as Plus,
  Delete02Icon as Trash2,
  SaveIcon as Save,
  ServerStack01Icon as Server,
  GlobeIcon as Globe,
  FileScriptIcon as FileJson,
  Loading03Icon as Loader2,
  CheckmarkCircle02Icon as CheckCircle2,
  Wifi01Icon as Wifi,
  AlertCircleIcon as AlertCircle,
  Alert02Icon as AlertTriangle,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

import { db } from '@/lib/db/client';
import {
  loadMcpServersSetting,
  parseMcpServersSetting,
  saveMcpServersSetting,
  toggleAllGlobalMcpTools,
  toggleGlobalMcpTool,
  updateServerTools,
} from '@/lib/mcp/settings';
import type { MCPServerConfig, MCPToolConfig } from '@/types';
import SubpageHeader from '@/components/shared/SubpageHeader';
import ListState from '@/components/shared/ListState';
import SettingsPanel from '@/components/settings/SettingsPanel';
import { isDirectoryTreeTool } from '@/lib/mcp/tool-policy';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const FORMAT_EXAMPLE = '{ "mcpServers": { "nombre": { "command", "args", "env" } } }';

function parseArgsInput(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.map((a) => String(a).trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean)
        : [];
    } catch { /* fall through */ }
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean);
  }
  return trimmed.split(/\s+/).map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean);
}

export default function MCPSettingsPanel() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [headersDrafts, setHeadersDrafts] = useState<Record<string, string>>({});
  const [serverTestStatus, setServerTestStatus] = useState<Record<string, 'idle' | 'testing' | 'ok' | 'error'>>({});
  const [serverTestResult, setServerTestResult] = useState<Record<string, { toolCount?: number; tools?: MCPToolConfig[]; error?: string }>>({});

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedServers = await loadMcpServersSetting();
      setServers(
        loadedServers.map((server) => ({
          ...server,
          enabled: server.enabled !== false,
          listRowId: server.listRowId ?? crypto.randomUUID(),
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.mcp.error_load'));
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMcpEnabled = useCallback(async () => {
    if (!db.isAvailable()) return;
    const res = await db.getMcpGlobalEnabled();
    setMcpEnabled(res.success ? res.data !== false : true);
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);
  useEffect(() => { loadMcpEnabled(); }, [loadMcpEnabled]);

  const handleMcpEnabledToggle = async (next: boolean) => {
    setMcpEnabled(next);
    if (db.isAvailable()) await db.setMcpGlobalEnabled(next);
  };

  const saveServers = async () => {
    if (!db.isAvailable()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await saveMcpServersSetting(
        servers.map(({ listRowId: _rowId, ...config }) => config),
      );
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error || t('settings.mcp.error_load'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.mcp.error_load'));
    } finally {
      setSaving(false);
    }
  };

  const addServer = () => {
    setServers((prev) => [
      ...prev,
      { name: '', type: 'stdio', command: '', args: [], enabled: true, listRowId: crypto.randomUUID() },
    ]);
  };

  const handleImport = () => {
    try {
      const list = parseMcpServersSetting(importJson);
      if (list.length > 0) {
        setServers(
          list.map((server) => ({
            ...server,
            enabled: server.enabled !== false,
            listRowId: server.listRowId ?? crypto.randomUUID(),
          })),
        );
        setShowImport(false);
        setImportJson('');
        setError(null);
      } else {
        setError(t('settings.mcp.error_no_servers'));
      }
    } catch {
      setError(t('settings.mcp.error_invalid_json'));
    }
  };

  const removeServer = (index: number) => {
    setServers((prev) => prev.filter((_, i) => i !== index));
  };

  const updateServer = (index: number, updates: Partial<MCPServerConfig>) => {
    setServers((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  };

  const replaceServer = (index: number, nextServer: MCPServerConfig) => {
    setServers((prev) => prev.map((server, currentIndex) => (currentIndex === index ? nextServer : server)));
  };

  const handleTestServer = async (index: number) => {
    if (typeof window === 'undefined' || !window.electron?.mcp?.testServer) return;
    const server = servers[index];
    if (!server || (!server.command && !server.url)) return;
    const rowId = server.listRowId ?? String(index);
    setServerTestStatus((s) => ({ ...s, [rowId]: 'testing' }));
    setServerTestResult((r) => { const next = { ...r }; delete next[rowId]; return next; });
    try {
      const result = await window.electron.mcp.testServer({
        name: server.name,
        type: server.type,
        command: server.command,
        args: server.args,
        url: server.url,
        headers: server.headers,
        env: server.env,
      });
      if (result.success) {
        setServerTestStatus((s) => ({ ...s, [rowId]: 'ok' }));
        setServerTestResult((r) => ({ ...r, [rowId]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }));
        replaceServer(index, updateServerTools(server, result.tools ?? []));
      } else {
        setServerTestStatus((s) => ({ ...s, [rowId]: 'error' }));
        setServerTestResult((r) => ({ ...r, [rowId]: { error: result.error ?? 'Error desconocido' } }));
        replaceServer(index, { ...server, lastDiscoveryAt: Date.now(), lastDiscoveryError: result.error ?? 'Error desconocido' });
      }
    } catch (err) {
      setServerTestStatus((s) => ({ ...s, [rowId]: 'error' }));
      setServerTestResult((r) => ({ ...r, [rowId]: { error: err instanceof Error ? err.message : String(err) } }));
    }
  };

  if (loading) {
    return <ListState variant="loading" loadingLabel={t('settings.mcp.loading')} />;
  }

  return (
    <SettingsPanel>
      <SubpageHeader className={"!border-0 p-0 bg-transparent"}>
  <SubpageHeader.Title>{t('settings.mcp.subtitle')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('settings.mcp.subtitle')}</SubpageHeader.Subtitle>
</SubpageHeader>

      {error ? <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircle} aria-hidden /><AlertDescription className="text-xs">{error}</AlertDescription></Alert> : null}

      {/* Global toggle */}
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.mcp.section_global')}</p>
        <Card className="p-4">
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">{t('settings.mcp.mcp_enabled')}</p>
              <p className="text-xs mt-0.5 text-muted-foreground">{t('settings.mcp.mcp_enabled_desc')}</p>
            </div>
            <Switch checked={mcpEnabled} onCheckedChange={(v) => void handleMcpEnabledToggle(v)} size="sm" />
          </div>
        </Card>
      </div>

      {/* Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest opacity-60 text-muted-foreground">{t('settings.mcp.section_servers')}</p>
          <div className="flex items-center gap-1.5">
            <Button type="button"
  variant="outline"
  onClick={() => {
                setShowImport(true);
                setError(null);
                setImportJson('');
              }}
  size="sm">{<HugeiconsIcon icon={FileJson} className="size-3.5" aria-hidden />}
              {t('settings.mcp.import_json')}
            </Button>
            <Button type="button"
  onClick={addServer}
  size="sm">{<HugeiconsIcon icon={Plus} className="size-3.5" aria-hidden />}
              {t('settings.mcp.add_server')}
            </Button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border">
            <ListState variant="empty" title={t('settings.mcp.no_servers')} compact />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {servers.map((server, index) => (
              <Card className="p-4 p-4" key={server.listRowId ?? index}>
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
                    {/* Row 1: toggle + name + type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Switch checked={server.enabled !== false} onCheckedChange={(v) => updateServer(index, { enabled: v })} size="sm" />
                      <Input className="w-40 py-1.5 text-xs" type="text" placeholder={t('settings.mcp.field_name')} value={server.name} onChange={(e) => updateServer(index, { name: e.target.value })} />
                      <Select value={server.type} onValueChange={(next) => {
                          const nextType = next as 'stdio' | 'http' | 'sse';
                          updateServer(index, {
                            type: nextType,
                            command: nextType === 'stdio' ? (server.command ?? '') : undefined,
                            args: nextType === 'stdio' ? (server.args ?? []) : undefined,
                            url: nextType === 'http' || nextType === 'sse' ? (server.url ?? '') : undefined,
                            headers: nextType === 'http' || nextType === 'sse' ? server.headers : undefined,
                          });
                        }}><SelectTrigger className="w-full py-1.5 text-xs w-auto shrink-0"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>
                        <SelectItem value="stdio">{t('settings.mcp.type_stdio')}</SelectItem>
                        <SelectItem value="http">{t('settings.mcp.type_http')}</SelectItem>
                        <SelectItem value="sse">{t('settings.mcp.type_sse')}</SelectItem>
                      </SelectGroup></SelectContent></Select>
                    </div>

                    {/* stdio fields */}
                    {server.type === 'stdio' ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <HugeiconsIcon icon={Server} className="size-3.5 shrink-0 text-muted-foreground" />
                            <Input className="w-24 py-1.5 text-xs font-mono" type="text" placeholder={t('settings.mcp.field_command')} value={server.command || ''} onChange={(e) => updateServer(index, { command: e.target.value })} />
                          </div>
                          <Input className="flex-1 min-w-0 py-1.5 text-xs font-mono" type="text" placeholder={t('settings.mcp.field_args')} value={(server.args || []).join(' ')} onChange={(e) => updateServer(index, { args: parseArgsInput(e.target.value) })} />
                        </div>
                        <div>
                          <label htmlFor={`mcp-server-env-${index}`} className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            env (JSON)
                          </label>
                          <Textarea className="min-h-24 resize-y w-full text-xs font-mono min-h-[48px] break-all" id={`mcp-server-env-${index}`} placeholder='{"API_KEY":"valor"}' value={envDrafts[server.listRowId ?? String(index)] ?? (server.env ? JSON.stringify(server.env) : '')} onChange={(e) => setEnvDrafts((d) => ({ ...d, [server.listRowId ?? String(index)]: e.target.value }))} onBlur={(e) => {
                              const v = e.target.value.trim();
                              setEnvDrafts((d) => {
                                const n = { ...d };
                                delete n[server.listRowId ?? String(index)];
                                return n;
                              });
                              if (!v) {
                                updateServer(index, { env: undefined });
                                return;
                              }
                              try {
                                updateServer(index, { env: JSON.parse(v) });
                              } catch {
                                updateServer(index, { env: undefined });
                              }
                            }} rows={3} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <HugeiconsIcon icon={Globe} className="size-3.5 shrink-0 text-muted-foreground" />
                          <Input className="flex-1 min-w-0 py-1.5 text-xs font-mono" type="url" placeholder="URL (http:// o https://)" value={server.url || ''} onChange={(e) => updateServer(index, { url: e.target.value })} />
                        </div>
                        <div>
                          <label htmlFor={`mcp-server-headers-${index}`} className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            Headers (JSON, opcional)
                          </label>
                          <Textarea className="min-h-24 resize-y w-full text-xs font-mono min-h-[48px]" id={`mcp-server-headers-${index}`} placeholder='{"Authorization": "Bearer token"}' value={headersDrafts[server.listRowId ?? String(index)] ?? (server.headers ? JSON.stringify(server.headers) : '')} onChange={(e) => setHeadersDrafts((d) => ({ ...d, [server.listRowId ?? String(index)]: e.target.value }))} onBlur={(e) => {
                              const v = e.target.value.trim();
                              setHeadersDrafts((d) => {
                                const n = { ...d };
                                delete n[server.listRowId ?? String(index)];
                                return n;
                              });
                              if (!v) {
                                updateServer(index, { headers: undefined });
                                return;
                              }
                              try {
                                updateServer(index, { headers: JSON.parse(v) });
                              } catch {
                                updateServer(index, { headers: undefined });
                              }
                            }} rows={3} />
                        </div>
                      </div>
                    )}

                    {/* Test result */}
                    {serverTestStatus[server.listRowId ?? String(index)] === 'ok' && serverTestResult[server.listRowId ?? String(index)]?.toolCount !== undefined ? (
                      <Alert role="note"><HugeiconsIcon icon={CheckCircle2} aria-hidden /><AlertDescription className="text-xs">
                        {serverTestResult[server.listRowId ?? String(index)]!.toolCount === 1
                          ? t('settings.mcp.connected_tools_one', { count: serverTestResult[server.listRowId ?? String(index)]!.toolCount })
                          : t('settings.mcp.connected_tools_many', { count: serverTestResult[server.listRowId ?? String(index)]!.toolCount })}
                      </AlertDescription></Alert>
                    ) : null}
                    {serverTestStatus[server.listRowId ?? String(index)] === 'error' && serverTestResult[server.listRowId ?? String(index)]?.error ? (
                      <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircle} aria-hidden /><AlertDescription className="text-xs">{serverTestResult[server.listRowId ?? String(index)]!.error}</AlertDescription></Alert>
                    ) : null}

                    {/* Tools list */}
                    {Array.isArray(server.tools) && server.tools.length > 0 && (
                      <div className="rounded-xl border bg-accent p-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div>
                            <p className="text-xs font-medium text-foreground">{t('settings.mcp.tools_active_globally')}</p>
                            <p className="text-[11px] text-muted-foreground">{t('settings.mcp.tools_reused')}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button type="button"
  onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, true))}
  size="xs">
                              {t('settings.mcp.enable_all')}
                            </Button>
                            <Button type="button"
  variant="outline"
  onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, false))}
  size="xs">
                              {t('settings.mcp.disable_all')}
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 max-h-52 overflow-y-auto pr-1">
                          {server.tools.some((tool) => isDirectoryTreeTool(tool.name)) ? (
                            <Alert className="mb-2 text-[12px]" role="note"><HugeiconsIcon icon={AlertTriangle} aria-hidden /><AlertDescription className="text-xs">
                              {t('settings.mcp.directory_tree_warning')}
                            </AlertDescription></Alert>
                          ) : null}
                          {server.tools.map((tool) => (
                            <div
                              key={tool.id}
                              className="flex items-center justify-between gap-3 p-2 rounded-lg"
                            >
                              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <Label
                                  htmlFor={`mcp-tool-${index}-${tool.id || tool.name}`}
                                  className="cursor-pointer text-sm"
                                >
                                  {tool.name}
                                </Label>
                                {(isDirectoryTreeTool(tool.name)
                                  ? t('settings.mcp.directory_tree_tool_desc')
                                  : tool.description) ? (
                                  <p className="text-xs text-muted-foreground">
                                    {isDirectoryTreeTool(tool.name)
                                      ? t('settings.mcp.directory_tree_tool_desc')
                                      : tool.description}
                                  </p>
                                ) : null}
                              </div>
                              <Checkbox
                                id={`mcp-tool-${index}-${tool.id || tool.name}`}
                                checked={tool.enabled !== false}
                                onCheckedChange={(v) =>
                                  replaceServer(index, toggleGlobalMcpTool(server, tool.id || tool.name, v === true))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Test button */}
                    {(server.command || server.url) ? (
                      <Button type="button"
  variant="outline"
  onClick={() => void handleTestServer(index)}
  disabled={serverTestStatus[server.listRowId ?? String(index)] === 'testing'}
  size="sm">{
                          serverTestStatus[server.listRowId ?? String(index)] === 'testing' ? (
                            <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <HugeiconsIcon icon={Wifi} className="size-3.5" aria-hidden />
                          )
                        }
                        {serverTestStatus[server.listRowId ?? String(index)] === 'testing' ? t('settings.mcp.discovering') : t('settings.mcp.test_discover')}
                      </Button>
                    ) : null}
                  </div>

                  <Button type="button"
  variant="ghost"
  onClick={() => removeServer(index)}
  aria-label={t('settings.mcp.delete_server')}
  className="shrink-0 text-muted-foreground"
  size="icon-sm">
                    <HugeiconsIcon icon={Trash2} className="size-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button"
  onClick={() => void saveServers()}
  disabled={saving}
  size="sm">{
            saving ? (
              <HugeiconsIcon icon={Loader2} className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <HugeiconsIcon icon={Save} className="size-3.5" aria-hidden />
            )
          }
          {saving ? t('settings.mcp.saving') : t('settings.mcp.save_config')}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs animate-in fade-in text-primary">
            <HugeiconsIcon icon={CheckCircle2} className="size-3.5" />
            {t('settings.mcp.saved')}
          </span>
        )}
      </div>

      <Dialog open={showImport} onOpenChange={(next) => { if (!next) (() => {
          setShowImport(false);
          setImportJson('');
          setError(null);
        })(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{t('settings.mcp.import_title')}</DialogTitle></div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="text-xs mb-3 text-[var(--muted-foreground)]">
          {t('settings.mcp.import_format', { format: FORMAT_EXAMPLE })}
        </p>
        {error ? (
          <p className="text-xs text-destructive mb-2" role="alert">
            {error}
          </p>
        ) : null}
        <Textarea className="min-h-24 resize-y flex-1 min-h-[200px] text-xs font-mono resize-none min-h-[200px]" placeholder={t('settings.mcp.import_placeholder')} value={importJson} onChange={(e) => setImportJson(e.target.value)} rows={12} />
      </div><DialogFooter className="border-t px-4 py-3">{<>
            <Button type="button"
  variant="outline"
  onClick={() => {
                setShowImport(false);
                setImportJson('');
                setError(null);
              }}
  size="sm">
              {t('common.cancel')}
            </Button>
            <Button type="button"
  onClick={handleImport}
  size="sm">
              {t('settings.mcp.import_btn')}
            </Button>
          </>}</DialogFooter></DialogContent></Dialog>
    </SettingsPanel>
  );
}
