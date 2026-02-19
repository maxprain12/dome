'use client';

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
  FolderOpen,
  Cloud,
  Database,
  Search,
  GitBranch,
  Plug2,
  FileText,
  Layers,
  List,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { db } from '@/lib/db/client';
import { RECOMMENDED_MCPS } from '@/lib/mcp/recommended-mcps';
import { showToast } from '@/lib/store/useToastStore';

interface MCPServerConfig {
  name: string;
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ICON_MAP: Record<string, any> = {
  FolderOpen,
  Cloud,
  Globe,
  Database,
  Search,
  GitBranch,
  Plug2,
  FileText,
  Layers,
  List,
  MessageSquare,
  Zap,
};

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

/** Normalize headers from import to Record<string, string>. */
function normalizeImportHeaders(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof k === 'string' && typeof val === 'string') out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
  const [serverTestResult, setServerTestResult] = useState<Record<number, { toolCount?: number; error?: string }>>({});
  const [showConnStrModal, setShowConnStrModal] = useState(false);
  const [connStrInput, setConnStrInput] = useState('');
  const [pendingMcpInstall, setPendingMcpInstall] = useState<typeof RECOMMENDED_MCPS[0] | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [pendingTokenMcpInstall, setPendingTokenMcpInstall] = useState<typeof RECOMMENDED_MCPS[0] | null>(null);

  const loadServers = useCallback(async () => {
    if (!db.isAvailable()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await db.getSetting('mcp_servers');
      if (result.success && result.data) {
        try {
          const parsed = JSON.parse(result.data);
          const list = Array.isArray(parsed) ? parsed : [];
          setServers(list.map((s: MCPServerConfig) => ({ ...s, enabled: s.enabled !== false })));
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

  const loadMcpEnabled = useCallback(async () => {
    if (!db.isAvailable()) return;
    const res = await db.getSetting('mcp_enabled');
    setMcpEnabled(res.data !== 'false');
  }, []);

  useEffect(() => {
    loadMcpEnabled();
  }, [loadMcpEnabled]);

  const handleMcpEnabledToggle = async () => {
    const next = !mcpEnabled;
    setMcpEnabled(next);
    if (db.isAvailable()) {
      await db.setSetting('mcp_enabled', next ? 'true' : 'false');
    }
  };

  const isMcpInstalled = (id: string) =>
    servers.some((s) => s.name?.toLowerCase().replace(/[^a-z0-9]/g, '_') === id.toLowerCase().replace(/[^a-z0-9]/g, '_'));

  const handleInstallRecommended = useCallback(
    async (mcp: (typeof RECOMMENDED_MCPS)[0]) => {
      if (mcp.requiresConfig === 'folder') {
        const path = await window.electron?.selectFolder?.();
        if (!path) return;
        const config = mcp.buildConfig(path);
        setServers((prev) => [...prev, { ...config, enabled: true }]);
        showToast('success', 'MCP añadido. Guarda los cambios para aplicar.');
        return;
      }
      if (mcp.requiresConfig === 'connectionString') {
        setPendingMcpInstall(mcp);
        setConnStrInput('postgres://user:password@localhost:5432/dbname');
        setShowConnStrModal(true);
        return;
      }
      if (mcp.requiresConfig === 'token') {
        setPendingTokenMcpInstall(mcp);
        setTokenInput('');
        setShowTokenModal(true);
        return;
      }
      if (mcp.requiresConfig === 'env') {
        const config = mcp.buildConfig();
        setServers((prev) => [...prev, { ...config, enabled: true }]);
        showToast('success', 'MCP añadido. Configura env (OAuth, token) en el servidor y guarda.');
        return;
      }
      const config = mcp.buildConfig();
      setServers((prev) => [...prev, { ...config, enabled: true }]);
      showToast('success', 'MCP añadido. Guarda los cambios para aplicar.');
    },
    [],
  );

  const handleTokenSubmit = () => {
    if (!pendingTokenMcpInstall) return;
    const config = pendingTokenMcpInstall.buildConfig(undefined, tokenInput.trim());
    setServers((prev) => [...prev, { ...config, enabled: true }]);
    setShowTokenModal(false);
    setPendingTokenMcpInstall(null);
    setTokenInput('');
    showToast('success', 'MCP añadido. Guarda los cambios para aplicar.');
  };

  const handleConnStrSubmit = () => {
    if (!pendingMcpInstall) return;
    const config = pendingMcpInstall.buildConfig(connStrInput.trim() || 'postgres://localhost:5432');
    setServers((prev) => [...prev, { ...config, enabled: true }]);
    setShowConnStrModal(false);
    setPendingMcpInstall(null);
    setConnStrInput('');
    showToast('success', 'MCP añadido. Guarda los cambios para aplicar.');
  };

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
    setServers((prev) => [...prev, { name: '', type: 'stdio', command: '', args: [], enabled: true }]);
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importJson);
      const list = Array.isArray(parsed)
        ? parsed
            .map((s) => {
              if (!s || typeof s !== 'object') return null;
              const t = s as Record<string, unknown>;
              let type: 'stdio' | 'http' | 'sse' = (t.type as 'stdio' | 'http' | 'sse') || 'stdio';
              if (t.transport === 'sse' || t.type === 'sse') type = 'sse';
              else if (typeof t.url === 'string') type = 'http';
              return {
                ...s,
                type,
                args: normalizeImportArgs(t.args),
                headers: normalizeImportHeaders(t.headers),
                enabled: t.enabled !== false,
              };
            })
            .filter(Boolean)
        : parsed?.mcpServers
          ? Object.entries(parsed.mcpServers as Record<string, Record<string, unknown>>).map(([k, v]) => {
              const hasUrl = typeof v.url === 'string';
              const transport = v.transport as string | undefined;
              const vType = v.type as string | undefined;
              const type: 'stdio' | 'http' | 'sse' =
                transport === 'sse' || vType === 'sse' ? 'sse'
                  : hasUrl ? 'http'
                  : 'stdio';
              return {
                name: k,
                type,
                command: (v.command as string) ?? '',
                args: normalizeImportArgs(v.args),
                url: v.url as string,
                headers: normalizeImportHeaders(v.headers),
                env: v.env as Record<string, string> | undefined,
                enabled: (v.enabled as boolean) !== false,
              };
            })
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

  const handleTestServer = async (index: number) => {
    if (typeof window === 'undefined' || !window.electron?.mcp?.testServer) return;
    const server = servers[index];
    if (!server || (!server.command && !server.url)) return;
    setServerTestStatus((s) => ({ ...s, [index]: 'testing' }));
    setServerTestResult((r) => {
      const next = { ...r };
      delete next[index];
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
        setServerTestStatus((s) => ({ ...s, [index]: 'ok' }));
        setServerTestResult((r) => ({ ...r, [index]: { toolCount: result.toolCount ?? 0 } }));
      } else {
        setServerTestStatus((s) => ({ ...s, [index]: 'error' }));
        setServerTestResult((r) => ({ ...r, [index]: { error: result.error ?? 'Error desconocido' } }));
      }
    } catch (err) {
      setServerTestStatus((s) => ({ ...s, [index]: 'error' }));
      setServerTestResult((r) => ({ ...r, [index]: { error: err instanceof Error ? err.message : String(err) } }));
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

      {error ? (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}>
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          MCP habilitado globalmente
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={mcpEnabled}
          onClick={handleMcpEnabledToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${mcpEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
        >
          <span
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-200 ease-out ${mcpEnabled ? 'left-[calc(100%-1.25rem)]' : 'left-1'}`}
          />
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
          One-Click Tools
        </h3>
        <p className="text-xs mb-3" style={{ color: 'var(--secondary-text)' }}>
          Instala MCPs recomendados con un clic.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RECOMMENDED_MCPS.map((mcp) => {
            const IconComponent = ICON_MAP[mcp.icon] ?? Plug2;
            const installed = isMcpInstalled(mcp.id);
            return (
              <div
                key={mcp.id}
                className="rounded-lg border px-3 py-2.5 flex flex-col min-h-[120px]"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <div className="flex-1 min-h-0 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 shrink-0">
                    <IconComponent size={16} strokeWidth={2} style={{ color: 'var(--secondary-text)' }} />
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {mcp.name}
                    </span>
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--secondary-text)' }}>
                    {mcp.description}
                  </p>
                  {mcp.note ? (
                    <p className="text-[10px] italic line-clamp-2" style={{ color: 'var(--tertiary-text)' }}>
                      {mcp.note}
                    </p>
                  ) : null}
                </div>
                <div className="mt-auto pt-2 shrink-0">
                  {installed ? (
                    <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                      Ya instalado
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleInstallRecommended(mcp)}
                      className="text-xs font-medium px-2 py-1 rounded"
                      style={{ backgroundColor: 'var(--primary-subtle)', color: 'var(--accent)' }}
                    >
                      Instalar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
                      <button
                        type="button"
                        role="switch"
                        aria-checked={server.enabled !== false}
                        onClick={() => updateServer(index, { enabled: server.enabled === false })}
                        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${server.enabled !== false ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
                        title={server.enabled !== false ? 'Activo' : 'Inactivo'}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-all duration-200 ease-out ${server.enabled !== false ? 'left-[calc(100%-1.25rem)]' : 'left-0.5'}`}
                        />
                      </button>
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
                        className="rounded-md border px-3 py-2 text-sm"
                        style={inputStyle}
                      >
                        <option value="stdio">stdio</option>
                        <option value="http">HTTP (Streamable)</option>
                        <option value="sse">SSE (legacy)</option>
                      </select>
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
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Globe className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
                          <input
                            type="url"
                            placeholder="URL (http:// o https://)"
                            value={server.url || ''}
                            onChange={(e) => updateServer(index, { url: e.target.value })}
                            className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label className="block text-xs mt-1 mb-1" style={{ color: 'var(--secondary-text)' }}>
                            Headers (JSON, opcional, ej. autenticación)
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
                            className="w-full rounded-md border px-3 py-2 text-sm font-mono min-h-[50px]"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    )}
                    {serverTestStatus[index] === 'ok' && serverTestResult[index]?.toolCount !== undefined ? (
                      <div
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ backgroundColor: 'var(--success-bg, rgba(34,197,94,0.15))', color: 'var(--success, #22c55e)' }}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          Conectado · {serverTestResult[index]!.toolCount} herramienta{serverTestResult[index]!.toolCount !== 1 ? 's' : ''} disponible{serverTestResult[index]!.toolCount !== 1 ? 's' : ''} en Many
                        </span>
                      </div>
                    ) : serverTestStatus[index] === 'error' && serverTestResult[index]?.error ? (
                      <div
                        className="rounded-lg px-3 py-2 text-xs"
                        style={{ backgroundColor: 'var(--error-bg)', color: 'var(--error)' }}
                      >
                        {serverTestResult[index]!.error}
                      </div>
                    ) : null}
                    {(server.command || server.url) && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTestServer(index)}
                          disabled={serverTestStatus[index] === 'testing'}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border disabled:opacity-50"
                          style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
                        >
                          {serverTestStatus[index] === 'testing' ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Wifi className="w-4 h-4" />
                          )}
                          {serverTestStatus[index] === 'testing' ? 'Probando...' : 'Probar conexión'}
                        </button>
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
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--accent)' }}
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

      {showConnStrModal && pendingMcpInstall ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setShowConnStrModal(false); setPendingMcpInstall(null); }}
        >
          <div
            className="rounded-lg border p-6 max-w-md w-full"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {pendingMcpInstall.name}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--secondary-text)' }}>
              DSN (ej. postgres://user:password@localhost:5432/dbname)
            </p>
            <input
              type="text"
              value={connStrInput}
              onChange={(e) => setConnStrInput(e.target.value)}
              placeholder="postgres://localhost:5432/dbname"
              className="w-full rounded-md border px-3 py-2 text-sm font-mono mb-4"
              style={inputStyle}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConnStrSubmit}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={() => { setShowConnStrModal(false); setPendingMcpInstall(null); }}
                className="rounded-lg px-4 py-2 text-sm font-medium border"
                style={{ borderColor: 'var(--border)', color: 'var(--secondary-text)' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTokenModal && pendingTokenMcpInstall ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setShowTokenModal(false); setPendingTokenMcpInstall(null); }}
        >
          <div
            className="rounded-lg border p-6 max-w-md w-full"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-secondary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {pendingTokenMcpInstall.name}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--secondary-text)' }}>
              Introduce tu API key o token para {pendingTokenMcpInstall.name}
            </p>
            <input
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={pendingTokenMcpInstall.tokenEnvVar ?? 'API key o token'}
              className="w-full rounded-md border px-3 py-2 text-sm font-mono mb-4"
              style={inputStyle}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleTokenSubmit}
                disabled={!tokenInput.trim()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Instalar
              </button>
              <button
                type="button"
                onClick={() => { setShowTokenModal(false); setPendingTokenMcpInstall(null); setTokenInput(''); }}
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
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 text-white"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
