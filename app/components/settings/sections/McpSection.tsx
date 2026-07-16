import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  FileScriptIcon,
  GlobeIcon,
  Plug02Icon,
  PlusSignIcon,
  SaveIcon,
  ServerStack01Icon,
  Wifi01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import { db } from '@/lib/db/client';
import {
  loadMcpServersSetting,
  parseMcpServersSetting,
  saveMcpServersSetting,
  toggleAllGlobalMcpTools,
  toggleGlobalMcpTool,
  updateServerTools,
} from '@/lib/mcp/settings';
import { isDirectoryTreeTool } from '@/lib/mcp/tool-policy';
import type { MCPServerConfig, MCPToolConfig } from '@/types';

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
    } catch {
      /* fall through */
    }
  }
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, ''))
      .filter(Boolean);
  }
  return trimmed
    .split(/\s+/)
    .map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, ''))
    .filter(Boolean);
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'error';
type TestResult = { toolCount?: number; tools?: MCPToolConfig[]; error?: string };

export default function McpSection() {
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
  const [serverTestStatus, setServerTestStatus] = useState<Record<string, TestStatus>>({});
  const [serverTestResult, setServerTestResult] = useState<Record<string, TestResult>>({});

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

  useEffect(() => {
    loadServers();
  }, [loadServers]);
  useEffect(() => {
    loadMcpEnabled();
  }, [loadMcpEnabled]);

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
    setServers((prev) =>
      prev.map((server, currentIndex) => (currentIndex === index ? nextServer : server)),
    );
  };

  const handleTestServer = async (index: number) => {
    if (typeof window === 'undefined' || !window.electron?.mcp?.testServer) return;
    const server = servers[index];
    if (!server || (!server.command && !server.url)) return;
    const rowId = server.listRowId ?? String(index);
    setServerTestStatus((s) => ({ ...s, [rowId]: 'testing' }));
    setServerTestResult((r) => {
      const next = { ...r };
      delete next[rowId];
      return next;
    });
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
        setServerTestResult((r) => ({
          ...r,
          [rowId]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] },
        }));
        replaceServer(index, updateServerTools(server, result.tools ?? []));
      } else {
        setServerTestStatus((s) => ({ ...s, [rowId]: 'error' }));
        setServerTestResult((r) => ({
          ...r,
          [rowId]: { error: result.error ?? 'Error desconocido' },
        }));
        replaceServer(index, {
          ...server,
          lastDiscoveryAt: Date.now(),
          lastDiscoveryError: result.error ?? 'Error desconocido',
        });
      }
    } catch (err) {
      setServerTestStatus((s) => ({ ...s, [rowId]: 'error' }));
      setServerTestResult((r) => ({
        ...r,
        [rowId]: { error: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <SettingsSurface
      icon={Plug02Icon}
      title={t('settings.tabs.mcp')}
      description={t('settings.mcp.subtitle')}
      actions={
        <>
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} />
              {t('settings.mcp.saved')}
            </span>
          ) : null}
          <Button type="button" size="sm" onClick={() => void saveServers()} disabled={saving}>
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />
            )}
            {saving ? t('settings.mcp.saving') : t('settings.mcp.save_config')}
          </Button>
        </>
      }
    >
      {error && !showImport ? (
        <Alert variant="destructive" role="note">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup title={t('settings.mcp.section_global')}>
        <SettingsRow
          title={t('settings.mcp.mcp_enabled')}
          description={t('settings.mcp.mcp_enabled_desc')}
          control={
            <Switch
              checked={mcpEnabled}
              onCheckedChange={(v) => void handleMcpEnabledToggle(v)}
              aria-label={t('settings.mcp.mcp_enabled')}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title={t('settings.mcp.section_servers')}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowImport(true);
                setError(null);
                setImportJson('');
              }}
            >
              <HugeiconsIcon icon={FileScriptIcon} data-icon="inline-start" />
              {t('settings.mcp.import_json')}
            </Button>
            <Button type="button" size="sm" onClick={addServer}>
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              {t('settings.mcp.add_server')}
            </Button>
          </>
        }
        bare
      >
        {servers.length === 0 ? (
          <Empty className="rounded-xl border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={ServerStack01Icon} />
              </EmptyMedia>
              <EmptyTitle>{t('settings.mcp.no_servers')}</EmptyTitle>
              <EmptyDescription>{t('settings.mcp.mcp_enabled_desc')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {servers.map((server, index) => {
              const rowId = server.listRowId ?? String(index);
              const testStatus = serverTestStatus[rowId] ?? 'idle';
              const testResult = serverTestResult[rowId];
              return (
                <div key={rowId} className="rounded-xl border bg-card p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2">
                        <Switch
                          checked={server.enabled !== false}
                          onCheckedChange={(v) => updateServer(index, { enabled: v })}
                          aria-label={server.name || t('settings.mcp.field_name')}
                        />
                        <Input
                          className="w-40"
                          type="text"
                          placeholder={t('settings.mcp.field_name')}
                          value={server.name}
                          onChange={(e) => updateServer(index, { name: e.target.value })}
                        />
                        <Select
                          value={server.type}
                          onValueChange={(next) => {
                            const nextType = next as 'stdio' | 'http' | 'sse';
                            updateServer(index, {
                              type: nextType,
                              command: nextType === 'stdio' ? (server.command ?? '') : undefined,
                              args: nextType === 'stdio' ? (server.args ?? []) : undefined,
                              url:
                                nextType === 'http' || nextType === 'sse'
                                  ? (server.url ?? '')
                                  : undefined,
                              headers:
                                nextType === 'http' || nextType === 'sse'
                                  ? server.headers
                                  : undefined,
                            });
                          }}
                        >
                          <SelectTrigger className="w-auto shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="stdio">{t('settings.mcp.type_stdio')}</SelectItem>
                              <SelectItem value="http">{t('settings.mcp.type_http')}</SelectItem>
                              <SelectItem value="sse">{t('settings.mcp.type_sse')}</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>

                      {server.type === 'stdio' ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex items-center gap-1.5">
                              <HugeiconsIcon
                                icon={ServerStack01Icon}
                                className="shrink-0 text-muted-foreground"
                              />
                              <Input
                                className="w-28 font-mono text-xs"
                                type="text"
                                placeholder={t('settings.mcp.field_command')}
                                value={server.command || ''}
                                onChange={(e) => updateServer(index, { command: e.target.value })}
                              />
                            </span>
                            <Input
                              className="min-w-0 flex-1 font-mono text-xs"
                              type="text"
                              placeholder={t('settings.mcp.field_args')}
                              value={(server.args || []).join(' ')}
                              onChange={(e) =>
                                updateServer(index, { args: parseArgsInput(e.target.value) })
                              }
                            />
                          </div>
                          <Field>
                            <FieldLabel
                              htmlFor={`mcp-server-env-${index}`}
                              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              env (JSON)
                            </FieldLabel>
                            <Textarea
                              id={`mcp-server-env-${index}`}
                              className="min-h-12 w-full resize-y break-all font-mono text-xs"
                              placeholder='{"API_KEY":"valor"}'
                              rows={3}
                              value={envDrafts[rowId] ?? (server.env ? JSON.stringify(server.env) : '')}
                              onChange={(e) =>
                                setEnvDrafts((d) => ({ ...d, [rowId]: e.target.value }))
                              }
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                setEnvDrafts((d) => {
                                  const n = { ...d };
                                  delete n[rowId];
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
                              }}
                            />
                          </Field>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <span className="flex items-center gap-2">
                            <HugeiconsIcon icon={GlobeIcon} className="shrink-0 text-muted-foreground" />
                            <Input
                              className="min-w-0 flex-1 font-mono text-xs"
                              type="url"
                              placeholder="URL (http:// o https://)"
                              value={server.url || ''}
                              onChange={(e) => updateServer(index, { url: e.target.value })}
                            />
                          </span>
                          <Field>
                            <FieldLabel
                              htmlFor={`mcp-server-headers-${index}`}
                              className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                            >
                              Headers (JSON, opcional)
                            </FieldLabel>
                            <Textarea
                              id={`mcp-server-headers-${index}`}
                              className="min-h-12 w-full resize-y font-mono text-xs"
                              placeholder='{"Authorization": "Bearer token"}'
                              rows={3}
                              value={
                                headersDrafts[rowId] ??
                                (server.headers ? JSON.stringify(server.headers) : '')
                              }
                              onChange={(e) =>
                                setHeadersDrafts((d) => ({ ...d, [rowId]: e.target.value }))
                              }
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                setHeadersDrafts((d) => {
                                  const n = { ...d };
                                  delete n[rowId];
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
                              }}
                            />
                          </Field>
                        </div>
                      )}

                      {testStatus === 'ok' && testResult?.toolCount !== undefined ? (
                        <Alert role="note">
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden />
                          <AlertDescription className="text-xs">
                            {testResult.toolCount === 1
                              ? t('settings.mcp.connected_tools_one', { count: testResult.toolCount })
                              : t('settings.mcp.connected_tools_many', { count: testResult.toolCount })}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      {testStatus === 'error' && testResult?.error ? (
                        <Alert variant="destructive" role="note">
                          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
                          <AlertDescription className="text-xs">{testResult.error}</AlertDescription>
                        </Alert>
                      ) : null}

                      {Array.isArray(server.tools) && server.tools.length > 0 ? (
                        <div className="rounded-lg border bg-muted/40 p-3">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium">
                                {t('settings.mcp.tools_active_globally')}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t('settings.mcp.tools_reused')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, true))}
                              >
                                {t('settings.mcp.enable_all')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, false))}
                              >
                                {t('settings.mcp.disable_all')}
                              </Button>
                            </div>
                          </div>
                          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto pr-1">
                            {server.tools.some((tool) => isDirectoryTreeTool(tool.name)) ? (
                              <Alert className="mb-2" role="note">
                                <HugeiconsIcon icon={Alert02Icon} aria-hidden />
                                <AlertDescription className="text-xs">
                                  {t('settings.mcp.directory_tree_warning')}
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            {server.tools.map((tool) => (
                              <div
                                key={tool.id}
                                className="flex items-center justify-between gap-3 rounded-lg p-2"
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
                                    replaceServer(
                                      index,
                                      toggleGlobalMcpTool(server, tool.id || tool.name, v === true),
                                    )
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {server.command || server.url ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={() => void handleTestServer(index)}
                          disabled={testStatus === 'testing'}
                        >
                          {testStatus === 'testing' ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <HugeiconsIcon icon={Wifi01Icon} data-icon="inline-start" />
                          )}
                          {testStatus === 'testing'
                            ? t('settings.mcp.discovering')
                            : t('settings.mcp.test_discover')}
                        </Button>
                      ) : null}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      onClick={() => removeServer(index)}
                      aria-label={t('settings.mcp.delete_server')}
                      title={t('settings.mcp.delete_server')}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingsGroup>

      <Dialog
        open={showImport}
        onOpenChange={(next) => {
          if (!next) {
            setShowImport(false);
            setImportJson('');
            setError(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b px-4 py-3">
            <DialogTitle className="truncate">{t('settings.mcp.import_title')}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="mb-3 text-xs text-muted-foreground">
              {t('settings.mcp.import_format', { format: FORMAT_EXAMPLE })}
            </p>
            {error ? (
              <p className="mb-2 text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Textarea
              className="min-h-[200px] flex-1 resize-y font-mono text-xs"
              placeholder={t('settings.mcp.import_placeholder')}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              rows={12}
            />
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowImport(false);
                setImportJson('');
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" size="sm" onClick={handleImport}>
              {t('settings.mcp.import_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSurface>
  );
}
