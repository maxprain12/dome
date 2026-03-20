
import { useState, useEffect, useCallback } from 'react';
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
  AlertCircle,
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

const DOME_GREEN = '#596037';
const DOME_GREEN_LIGHT = '#E0EAB4';

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
      {children}
    </p>
  );
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl ${className}`} style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="relative shrink-0 w-9 h-5 rounded-full transition-colors duration-200"
      style={{ backgroundColor: checked ? DOME_GREEN : 'var(--dome-border)' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--dome-bg-hover)',
  border: '1px solid var(--dome-border)',
  color: 'var(--dome-text)',
  outline: 'none',
};

export default function MCPSettingsPanel() {
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
      setError(err instanceof Error ? err.message : 'Error al cargar configuración');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMcpEnabled = useCallback(async () => {
    if (!db.isAvailable()) return;
    const res = await db.getSetting('mcp_enabled');
    setMcpEnabled(res.data !== 'false');
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);
  useEffect(() => { loadMcpEnabled(); }, [loadMcpEnabled]);

  const handleMcpEnabledToggle = async () => {
    const next = !mcpEnabled;
    setMcpEnabled(next);
    if (db.isAvailable()) await db.setSetting('mcp_enabled', next ? 'true' : 'false');
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
        setError(result.error || 'Error al guardar');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
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
        setError('No se encontraron servidores válidos en el JSON');
      }
    } catch {
      setError('JSON inválido. Usa el formato mcpServers o array.');
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
    return (
      <div className="flex items-center gap-2 text-xs animate-pulse" style={{ color: 'var(--dome-text-muted)' }}>
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-0.5" style={{ color: 'var(--dome-text)' }}>MCP</h2>
        <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
          Model Context Protocol — configura servidores MCP, descubre sus tools y define cuáles quedan activas globalmente para Many, agentes y equipos.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Global toggle */}
      <div>
        <SectionLabel>Global</SectionLabel>
        <SettingsCard>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>MCP habilitado</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>Activa o desactiva todos los servidores MCP globalmente</p>
            </div>
            <Toggle checked={mcpEnabled} onChange={handleMcpEnabledToggle} />
          </div>
        </SettingsCard>
      </div>

      {/* Servers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Servidores</SectionLabel>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setShowImport(true); setError(null); setImportJson(''); }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
            >
              <FileJson className="w-3.5 h-3.5" />
              Importar JSON
            </button>
            <button
              type="button"
              onClick={addServer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-white transition-all"
              style={{ backgroundColor: DOME_GREEN }}
            >
              <Plus className="w-3.5 h-3.5" />
              Añadir servidor
            </button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div className="py-10 rounded-xl text-center" style={{ border: '1.5px dashed var(--dome-border)' }}>
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>Sin servidores MCP. Añade uno o importa JSON.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {servers.map((server, index) => (
              <SettingsCard key={index} className="p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex-1 min-w-0 space-y-3 overflow-hidden">
                    {/* Row 1: toggle + name + type */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Toggle
                        checked={server.enabled !== false}
                        onChange={() => updateServer(index, { enabled: server.enabled === false })}
                      />
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={server.name}
                        onChange={(e) => updateServer(index, { name: e.target.value })}
                        className="rounded-lg px-3 py-1.5 text-xs w-40"
                        style={inputStyle}
                      />
                      <select
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
                        className="rounded-lg px-3 py-1.5 text-xs"
                        style={inputStyle}
                      >
                        <option value="stdio">stdio</option>
                        <option value="http">HTTP (Streamable)</option>
                        <option value="sse">SSE (legacy)</option>
                      </select>
                    </div>

                    {/* stdio fields */}
                    {server.type === 'stdio' ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                            <input
                              type="text"
                              placeholder="Comando"
                              value={server.command || ''}
                              onChange={(e) => updateServer(index, { command: e.target.value })}
                              className="rounded-lg px-3 py-1.5 text-xs w-24 font-mono"
                              style={inputStyle}
                            />
                          </div>
                          <input
                            type="text"
                            placeholder="Args (ej: -y @pkg/server)"
                            value={(server.args || []).join(' ')}
                            onChange={(e) => updateServer(index, { args: parseArgsInput(e.target.value) })}
                            className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-xs font-mono"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                            env (JSON)
                          </label>
                          <textarea
                            placeholder='{"API_KEY":"valor"}'
                            value={envDrafts[index] ?? (server.env ? JSON.stringify(server.env) : '')}
                            onChange={(e) => setEnvDrafts((d) => ({ ...d, [index]: e.target.value }))}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              setEnvDrafts((d) => { const n = { ...d }; delete n[index]; return n; });
                              if (!v) { updateServer(index, { env: undefined }); return; }
                              try { updateServer(index, { env: JSON.parse(v) }); } catch { updateServer(index, { env: undefined }); }
                            }}
                            className="w-full rounded-lg px-3 py-2 text-xs font-mono min-h-[48px] resize-y"
                            style={{ ...inputStyle, wordBreak: 'break-all', overflowWrap: 'break-word' }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
                          <input
                            type="url"
                            placeholder="URL (http:// o https://)"
                            value={server.url || ''}
                            onChange={(e) => updateServer(index, { url: e.target.value })}
                            className="flex-1 rounded-lg px-3 py-1.5 text-xs font-mono"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}>
                            Headers (JSON, opcional)
                          </label>
                          <textarea
                            placeholder='{"Authorization": "Bearer token"}'
                            value={headersDrafts[index] ?? (server.headers ? JSON.stringify(server.headers) : '')}
                            onChange={(e) => setHeadersDrafts((d) => ({ ...d, [index]: e.target.value }))}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              setHeadersDrafts((d) => { const n = { ...d }; delete n[index]; return n; });
                              if (!v) { updateServer(index, { headers: undefined }); return; }
                              try { updateServer(index, { headers: JSON.parse(v) }); } catch { updateServer(index, { headers: undefined }); }
                            }}
                            className="w-full rounded-lg px-3 py-2 text-xs font-mono min-h-[48px]"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    )}

                    {/* Test result */}
                    {serverTestStatus[index] === 'ok' && serverTestResult[index]?.toolCount !== undefined && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: `${DOME_GREEN}12`, border: `1px solid ${DOME_GREEN}30`, color: DOME_GREEN }}>
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Conectado · {serverTestResult[index]!.toolCount} herramienta{serverTestResult[index]!.toolCount !== 1 ? 's' : ''} disponible{serverTestResult[index]!.toolCount !== 1 ? 's' : ''}
                      </div>
                    )}
                    {serverTestStatus[index] === 'error' && serverTestResult[index]?.error && (
                      <div className="px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--dome-error, #ef4444)' }}>
                        {serverTestResult[index]!.error}
                      </div>
                    )}

                    {/* Tools list */}
                    {Array.isArray(server.tools) && server.tools.length > 0 && (
                      <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}>
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div>
                            <p className="text-xs font-medium" style={{ color: 'var(--dome-text)' }}>Tools activas globalmente</p>
                            <p className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>Se reutilizan en Many, agentes y equipos.</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, true))}
                              className="rounded-lg px-2 py-1 text-[11px] font-medium"
                              style={{ backgroundColor: `${DOME_GREEN}15`, color: DOME_GREEN }}
                            >
                              Activar todas
                            </button>
                            <button
                              type="button"
                              onClick={() => replaceServer(index, toggleAllGlobalMcpTools(server, false))}
                              className="rounded-lg px-2 py-1 text-[11px] font-medium"
                              style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
                            >
                              Desactivar todas
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                          {server.tools.map((tool) => (
                            <label
                              key={tool.id}
                              className="flex items-start justify-between gap-3 px-2 py-2 rounded-lg cursor-pointer"
                              style={{ backgroundColor: 'transparent' }}
                            >
                              <div className="min-w-0 overflow-hidden">
                                <p className="text-xs truncate" style={{ color: 'var(--dome-text)' }}>{tool.name}</p>
                                {tool.description && (
                                  <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--dome-text-muted)' }}>{tool.description}</p>
                                )}
                              </div>
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded shrink-0"
                                checked={tool.enabled !== false}
                                onChange={(e) => replaceServer(index, toggleGlobalMcpTool(server, tool.id || tool.name, e.target.checked))}
                                style={{ accentColor: DOME_GREEN }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Test button */}
                    {(server.command || server.url) && (
                      <button
                        type="button"
                        onClick={() => handleTestServer(index)}
                        disabled={serverTestStatus[index] === 'testing'}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
                      >
                        {serverTestStatus[index] === 'testing'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Wifi className="w-3.5 h-3.5" />
                        }
                        {serverTestStatus[index] === 'testing' ? 'Descubriendo...' : 'Probar y descubrir tools'}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeServer(index)}
                    className="p-1.5 rounded-lg shrink-0 transition-colors"
                    style={{ color: 'var(--dome-text-muted)' }}
                    aria-label="Eliminar servidor"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </SettingsCard>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={saveServers}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50"
          style={{ backgroundColor: DOME_GREEN }}
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-xs animate-in fade-in" style={{ color: DOME_GREEN }}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            Guardado
          </span>
        )}
      </div>

      {/* Import modal */}
      {showImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowImport(false)}
        >
          <div
            className="rounded-xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--dome-text)' }}>Importar JSON</h3>
            <p className="text-xs mb-3" style={{ color: 'var(--dome-text-muted)' }}>Formato: {FORMAT_EXAMPLE}</p>
            <textarea
              placeholder="Pega tu JSON aquí"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="flex-1 min-h-[200px] rounded-lg px-3 py-2 text-xs font-mono resize-none"
              style={inputStyle}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleImport}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                style={{ backgroundColor: DOME_GREEN }}
              >
                Importar
              </button>
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportJson(''); setError(null); }}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--dome-surface)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
