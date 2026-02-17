'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Save, Server, Globe, FileJson, Loader2, CheckCircle2, Wifi } from 'lucide-react';
import { db } from '@/lib/db/client';

interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

const FORMAT_EXAMPLE = '{ "mcpServers": { "nombre": { "command", "args", "env" } } }';

/** Parse user input into clean args array. Handles JSON, comma-separated, and space-separated. */
function parseArgsInput(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  // JSON array: ["-y", "pkg", "connstr"]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.map((a) => String(a).trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean)
        : [];
    } catch {
      // fall through
    }
  }
  // Comma-separated: -y, pkg, connstr or "-y", "pkg", "connstr"
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, ''))
      .filter(Boolean);
  }
  // Space-separated, strip quotes from each token
  return trimmed
    .split(/\s+/)
    .map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, ''))
    .filter(Boolean);
}

/** Normalize args from import (string or array) to clean string array. */
function normalizeImportArgs(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((a) => String(a).trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean);
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (t.startsWith('[') && t.endsWith(']')) {
      try {
        const parsed = JSON.parse(t);
        return Array.isArray(parsed)
          ? parsed.map((a) => String(a).trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean)
          : [];
      } catch {
        // fall through
      }
    }
    if (t.includes(',')) {
      return t.split(',').map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean);
    }
    return t.split(/\s+/).map((s) => s.trim().replace(/^["'\s,]+|["'\s,]+$/g, '')).filter(Boolean);
  }
  return [];
}

export default function MCPSettingsPanel() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [envDrafts, setEnvDrafts] = useState<Record<number, string>>({});
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testToolCount, setTestToolCount] = useState(0);
  const [testError, setTestError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    if (!db.isAvailable()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await db.getSetting('mcp_servers');
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          setServers(Array.isArray(parsed) ? parsed : []);
        } catch {
          setServers([]);
        }
      } else {
        setServers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar configuración');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const saveServers = async () => {
    if (!db.isAvailable()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await db.setSetting('mcp_servers', JSON.stringify(servers));
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
    setServers((prev) => [...prev, { name: '', type: 'stdio', command: '', args: [] }]);
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      const list = Array.isArray(parsed)
        ? parsed.map((s) => (s && typeof s === 'object' ? { ...s, args: normalizeImportArgs(s.args) } : s))
        : parsed?.mcpServers
          ? Object.entries(parsed.mcpServers as Record<string, Record<string, unknown>>).map(([k, v]) => ({
              name: k,
              type: v.url ? 'http' : 'stdio',
              command: (v.command as string) ?? '',
              args: normalizeImportArgs(v.args),
              url: v.url as string,
              env: v.env as Record<string, string> | undefined,
            }))
          : [];
      if (list.length > 0) {
        setServers(list);
        setShowImport(false);
        setImportJson('');
        setError(null);
      } else {
        setError('No se encontraron servidores válidos en el JSON');
      }
    } catch (e) {
      setError('JSON inválido. Usa el formato mcpServers o array.');
    }
  };

  const removeServer = (index: number) => {
    setServers((prev) => prev.filter((_, i) => i !== index));
  };

  const updateServer = (index: number, updates: Partial<MCPServerConfig>) => {
    setServers((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  };

  const handleTestConnection = async () => {
    if (typeof window === 'undefined' || !window.electron?.mcp) return;
    setTestStatus('testing');
    setTestError(null);
    try {
      const result = await window.electron.mcp.testConnection();
      if (result.success) {
        setTestStatus('ok');
        setTestToolCount(result.toolCount ?? 0);
      } else {
        setTestStatus('error');
        setTestError(result.error ?? 'Error desconocido');
      }
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2" style={{ color: 'var(--secondary-text)' }}>
        <span className="animate-pulse">Cargando...</span>
      </div>
    );
  }

  const inputStyle = {
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
          MCP (Model Context Protocol)
        </h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--secondary-text)' }}>
          Las herramientas MCP configuradas aquí están disponibles en Many cuando chateas. Conecta servidores para ampliar las capacidades del asistente.
        </p>
      </div>

      {testStatus === 'ok' ? (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--success-bg, rgba(34,197,94,0.15))', color: 'var(--success, #22c55e)' }}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>Conectado · {testToolCount} herramienta{testToolCount !== 1 ? 's' : ''} disponible{testToolCount !== 1 ? 's' : ''} en Many</span>
        </div>
      ) : testStatus === 'error' && testError ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
        >
          {testError}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--secondary-text)' }}>
            Servidores
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowImport(true); setError(null); setImportJson(''); }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
            >
              <FileJson className="w-4 h-4" />
              Importar JSON
            </button>
            <button
              type="button"
              onClick={addServer}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--accent)' }}
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>
        </div>

        {servers.length === 0 ? (
          <div
            className="rounded-lg border border-dashed px-6 py-8 text-center text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
          >
            No hay servidores MCP. Añade uno o importa JSON.
          </div>
        ) : (
          <div className="space-y-4">
            {servers.map((server, index) => (
              <div
                key={index}
                className="rounded-lg border p-4"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={server.name}
                        onChange={(e) => updateServer(index, { name: e.target.value })}
                        className="rounded-md border px-3 py-2 text-sm w-48"
                        style={inputStyle}
                      />
                      <select
                        value={server.type}
                        onChange={(e) =>
                          updateServer(index, {
                            type: e.target.value as 'stdio' | 'http',
                            command: e.target.value === 'stdio' ? '' : undefined,
                            args: e.target.value === 'stdio' ? [] : undefined,
                            url: e.target.value === 'http' ? '' : undefined,
                          })
                        }
                        className="rounded-md border px-3 py-2 text-sm"
                        style={inputStyle}
                      >
                        <option value="stdio">stdio</option>
                        <option value="http">HTTP</option>
                      </select>
                      {testStatus === 'ok' && testToolCount > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--accent)' }}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Disponible en Many
                        </span>
                      ) : null}
                    </div>
                    {server.type === 'stdio' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Server className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
                          <input
                            type="text"
                            placeholder="Comando"
                            value={server.command || ''}
                            onChange={(e) => updateServer(index, { command: e.target.value })}
                            className="rounded-md border px-3 py-2 text-sm w-32 font-mono"
                            style={inputStyle}
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Args"
                          value={(server.args || []).join(' ')}
                          onChange={(e) =>
                            updateServer(index, {
                              args: parseArgsInput(e.target.value),
                            })
                          }
                          className="flex-1 min-w-[200px] rounded-md border px-3 py-2 text-sm font-mono"
                          style={inputStyle}
                        />
                        <div className="w-full">
                          <label className="block text-xs mt-2 mb-1" style={{ color: 'var(--secondary-text)' }}>
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
                            className="w-full rounded-md border px-3 py-2 text-sm font-mono min-h-[50px]"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
                        <input
                          type="url"
                          placeholder="URL"
                          value={server.url || ''}
                          onChange={(e) => updateServer(index, { url: e.target.value })}
                          className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
                          style={inputStyle}
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeServer(index)}
                    className="rounded p-2"
                    style={{ color: 'var(--secondary-text)' }}
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImport ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowImport(false)}
        >
          <div
            className="rounded-lg border p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Importar JSON
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--secondary-text)' }}>
              Formato: {FORMAT_EXAMPLE}
            </p>
            <textarea
              placeholder="Pega tu JSON aquí"
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              className="flex-1 min-h-[200px] rounded-md border px-3 py-2 text-sm font-mono resize-none"
              style={inputStyle}
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={handleImport}
                className="rounded-lg px-4 py-2 text-sm font-medium"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                Importar
              </button>
              <button
                type="button"
                onClick={() => { setShowImport(false); setImportJson(''); setError(null); }}
                className="rounded-lg px-4 py-2 text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          type="button"
          onClick={saveServers}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </button>
        {servers.length > 0 && typeof window !== 'undefined' && window.electron?.mcp ? (
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium border disabled:opacity-50"
            style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
          >
            {testStatus === 'testing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            {testStatus === 'testing' ? 'Probando...' : 'Probar conexión'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
