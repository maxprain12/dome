
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Trash2,
  Save,
  Server,
  Globe,
  FileJson,
  Loader2,
  CheckCircle2,
  Wifi,
} from 'lucide-react';
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
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { DomeSelect } from '@/components/ui/DomeSelect';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeListState from '@/components/ui/DomeListState';
import DomeModal from '@/components/ui/DomeModal';
import DomeCheckbox from '@/components/ui/DomeCheckbox';

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
  const [envDrafts, setEnvDrafts] = useState<Record<number, string>>({});
  const [headersDrafts, setHeadersDrafts] = useState<Record<number, string>>({});
  const [serverTestStatus, setServerTestStatus] = useState<Record<number, 'idle' | 'testing' | 'ok' | 'error'>>({});
  const [serverTestResult, setServerTestResult] = useState<Record<number, { toolCount?: number; tools?: MCPToolConfig[]; error?: string }>>({});

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedServers = await loadMcpServersSetting();
      setServers(loadedServers.map((server) => ({ ...server, enabled: server.enabled !== false })));
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
      const result = await saveMcpServersSetting(servers);
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
    setServers((prev) => [...prev, { name: '', type: 'stdio', command: '', args: [], enabled: true }]);
  };

  const handleImport = () => {
    try {
      const list = parseMcpServersSetting(importJson);
      if (list.length > 0) {
        setServers(list.map((server) => ({ ...server, enabled: server.enabled !== false })));
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
    setServerTestStatus((s) => ({ ...s, [index]: 'testing' }));
    setServerTestResult((r) => { const next = { ...r }; delete next[index]; return next; });
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
        setServerTestStatus((s) => ({ ...s, [index]: 'ok' }));
        setServerTestResult((r) => ({ ...r, [index]: { toolCount: result.toolCount ?? 0, tools: result.tools ?? [] } }));
        replaceServer(index, updateServerTools(server, result.tools ?? []));
      } else {
        setServerTestStatus((s) => ({ ...s, [index]: 'error' }));
        setServerTestResult((r) => ({ ...r, [index]: { error: result.error ?? 'Error desconocido' } }));
        replaceServer(index, { ...server, lastDiscoveryAt: Date.now(), lastDiscoveryError: result.error ?? 'Error desconocido' });
      }
    } catch (err) {
      setServerTestStatus((s) => ({ ...s, [index]: 'error' }));
      setServerTestResult((r) => ({ ...r, [index]: { error: err instanceof Error ? err.message : String(err) } }));
    }
  };

  if (loading) {
    return <DomeListState variant="loading" loadingLabel={t('settings.mcp.loading')} />;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DomeSubpageHeader
        className="!border-0 px-0 py-0 bg-transparent"
        title="MCP"
        subtitle={t('settings.mcp.subtitle')}
      />

      {error ? <DomeCallout tone="error">{error}</DomeCallout> : null}

      {/* Global toggle */}
      <div>
        <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.mcp.section_global')}</DomeSectionLabel>
        <DomeCard>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('settings.mcp.mcp_enabled')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.mcp.mcp_enabled_desc')}</p>
            </div>
            <DomeToggle checked={mcpEnabled} onChange={(v) => void handleMcpEnabledToggle(v)} size="sm" />
          </div>
        </DomeCard>
      </div>

      {/* Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <DomeSectionLabel className="mb-3 font-bold uppercase tracking-widest opacity-60 text-[var(--dome-text-muted)]">{t('settings.mcp.section_servers')}</DomeSectionLabel>
          <div className="flex items-center gap-1.5">
            <DomeButton
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowImport(true);
                setError(null);
                setImportJson('');
              }}
              leftIcon={<FileJson className="w-3.5 h-3.5" aria-hidden />}
            >
              {t('settings.mcp.import_json')}
            </DomeButton>
            <DomeButton type="button" variant="primary" size="sm" onClick={addServer} leftIcon={<Plus className="w-3.5 h-3.5" aria-hidden />}>
              {t('settings.mcp.add_server')}
            </DomeButton>
          </div>
        </div>

        {servers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--dome-border)]">
            <DomeListState variant="empty" title={t('settings.mcp.no_servers')} compact />
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server, index) => (
              <DomeCard key={index} className="p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex-1 min-w-0 space-y-3 overflow-hidden">
                    {/* Row 1: toggle + name + type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <DomeToggle
                        checked={server.enabled !== false}
                        onChange={(v) => updateServer(index, { enabled: v })}
                        size="sm"
                      />
                      <DomeInput
                        type="text"
                        placeholder={t('settings.mcp.field_name')}
                        value={server.name}
                        onChange={(e) => updateServer(index, { name: e.target.value })}
                        className="w-40"
                        inputClassName="py-1.5 text-xs"
                      />
                      <DomeSelect
                        value={server.type}
                        onChange={(e) => {
                          const nextType = e.target.value as 'stdio' | 'http' | 'sse';
                          updateServer(index, {
                            type: nextType,
                            command: nextType === 'stdio' ? (server.command ?? '') : undefined,
                            args: nextType === 'stdio' ? (server.args ?? []) : undefined,
                            url: nextType === 'http' || nextType === 'sse' ? (server.url ?? '') : undefined,
                            headers: nextType === 'http' || nextType === 'sse' ? server.headers : undefined,
                          });
                        }}
                        className="w-auto shrink-0"
                        selectClassName="py-1.5 text-xs"
                      >
                        <option value="stdio">{t('settings.mcp.type_stdio')}</option>
                        <option value="http">{t('settings.mcp.type_http')}</option>
                        <option value="sse">{t('settings.mcp.type_sse')}</option>
                      </DomeSelect>
                    </div>

                    {/* stdio fields */}
                    {server.type === 'stdio' ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                            <DomeInput
                              type="text"
                              placeholder={t('settings.mcp.field_command')}
                              value={server.command || ''}
                              onChange={(e) => updateServer(index, { command: e.target.value })}
                              className="w-24"
                              inputClassName="py-1.5 text-xs font-mono"
                            />
                          </div>
                          <DomeInput
                            type="text"
                            placeholder={t('settings.mcp.field_args')}
                            value={(server.args || []).join(' ')}
                            onChange={(e) => updateServer(index, { args: parseArgsInput(e.target.value) })}
                            className="flex-1 min-w-0"
                            inputClassName="py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                            env (JSON)
                          </label>
                          <DomeTextarea
                            placeholder='{"API_KEY":"valor"}'
                            value={envDrafts[index] ?? (server.env ? JSON.stringify(server.env) : '')}
                            onChange={(e) => setEnvDrafts((d) => ({ ...d, [index]: e.target.value }))}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              setEnvDrafts((d) => {
                                const n = { ...d };
                                delete n[index];
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
                            rows={3}
                            className="w-full"
                            textareaClassName="text-xs font-mono min-h-[48px] break-all"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                          <DomeInput
                            type="url"
                            placeholder="URL (http:// o https://)"
                            value={server.url || ''}
                            onChange={(e) => updateServer(index, { url: e.target.value })}
                            className="flex-1 min-w-0"
                            inputClassName="py-1.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                            Headers (JSON, opcional)
                          </label>
                          <DomeTextarea
                            placeholder='{"Authorization": "Bearer token"}'
                            value={headersDrafts[index] ?? (server.headers ? JSON.stringify(server.headers) : '')}
                            onChange={(e) => setHeadersDrafts((d) => ({ ...d, [index]: e.target.value }))}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              setHeadersDrafts((d) => {
                                const n = { ...d };
                                delete n[index];
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
                            rows={3}
                            className="w-full"
                            textareaClassName="text-xs font-mono min-h-[48px]"
                          />
                        </div>
                      </div>
                    )}

                    {/* Test result */}
                    {serverTestStatus[index] === 'ok' && serverTestResult[index]?.toolCount !== undefined ? (
                      <DomeCallout tone="success" icon={CheckCircle2}>
                        {serverTestResult[index]!.toolCount === 1
                          ? t('settings.mcp.connected_tools_one', { count: serverTestResult[index]!.toolCount })
                          : t('settings.mcp.connected_tools_many', { count: serverTestResult[index]!.toolCount })}
                      </DomeCallout>
                    ) : null}
                    {serverTestStatus[index] === 'error' && serverTestResult[index]?.error ? (
                      <DomeCallout tone="error">{serverTestResult[index]!.error}</DomeCallout>
                    ) : null}

                    {/* Tools list */}
                    {Array.isArray(server.tools) && server.tools.length > 0 && (
                      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>{t('settings.mcp.tools_active_globally')}</p>
                            <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>{t('settings.mcp.tools_reused')}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <DomeButton
                              type="button"
                              variant="primary"
                              size="xs"
                              onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, true))}
                            >
                              {t('settings.mcp.enable_all')}
                            </DomeButton>
                            <DomeButton
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, false))}
                            >
                              {t('settings.mcp.disable_all')}
                            </DomeButton>
                          </div>
                        </div>
                        <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                          {server.tools.map((tool) => (
                            <DomeCheckbox
                              key={tool.id}
                              reverse
                              className="px-2 py-2 rounded-lg cursor-pointer"
                              label={tool.name}
                              description={tool.description || undefined}
                              checked={tool.enabled !== false}
                              onChange={(e) =>
                                replaceServer(index, toggleGlobalMcpTool(server, tool.id || tool.name, e.target.checked))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Test button */}
                    {(server.command || server.url) ? (
                      <DomeButton
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleTestServer(index)}
                        disabled={serverTestStatus[index] === 'testing'}
                        leftIcon={
                          serverTestStatus[index] === 'testing' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                          ) : (
                            <Wifi className="w-3.5 h-3.5" aria-hidden />
                          )
                        }
                      >
                        {serverTestStatus[index] === 'testing' ? t('settings.mcp.discovering') : t('settings.mcp.test_discover')}
                      </DomeButton>
                    ) : null}
                  </div>

                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => removeServer(index)}
                    aria-label={t('settings.mcp.delete_server')}
                    className="shrink-0 text-[var(--dome-text-muted)]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </DomeButton>
                </div>
              </DomeCard>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 flex-wrap">
        <DomeButton
          type="button"
          variant="primary"
          size="sm"
          onClick={() => void saveServers()}
          disabled={saving}
          leftIcon={
            saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="w-3.5 h-3.5" aria-hidden />
            )
          }
        >
          {saving ? t('settings.mcp.saving') : t('settings.mcp.save_config')}
        </DomeButton>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs animate-in fade-in" style={{ color: 'var(--dome-accent)' }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t('settings.mcp.saved')}
          </span>
        )}
      </div>

      <DomeModal
        open={showImport}
        size="lg"
        title={t('settings.mcp.import_title')}
        onClose={() => {
          setShowImport(false);
          setImportJson('');
          setError(null);
        }}
        footer={
          <>
            <DomeButton
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
            </DomeButton>
            <DomeButton type="button" variant="primary" size="sm" onClick={handleImport}>
              {t('settings.mcp.import_btn')}
            </DomeButton>
          </>
        }
      >
        <p className="text-xs mb-3 text-[var(--dome-text-muted,var(--tertiary-text))]">
          {t('settings.mcp.import_format', { format: FORMAT_EXAMPLE })}
        </p>
        {error ? (
          <p className="text-xs text-[var(--error)] mb-2" role="alert">
            {error}
          </p>
        ) : null}
        <DomeTextarea
          placeholder={t('settings.mcp.import_placeholder')}
          value={importJson}
          onChange={(e) => setImportJson(e.target.value)}
          rows={12}
          className="flex-1 min-h-[200px]"
          textareaClassName="text-xs font-mono resize-none min-h-[200px]"
        />
      </DomeModal>
    </div>
  );
}
