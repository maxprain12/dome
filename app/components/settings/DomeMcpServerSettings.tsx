import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, CheckCircle2, Wifi, WifiOff, RefreshCw, Server } from 'lucide-react';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCard from '@/components/ui/DomeCard';
import DomeToggle from '@/components/ui/DomeToggle';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeButton from '@/components/ui/DomeButton';
import DomeCallout from '@/components/ui/DomeCallout';

interface McpStatus {
  running: boolean;
  port: number | null;
  sessions: { clientName: string }[];
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>{label}</p>
      <div
        className="rounded-md p-3 text-xs font-mono overflow-x-auto"
        style={{ backgroundColor: 'var(--dome-bg-tertiary)', color: 'var(--dome-text)' }}
      >
        <pre className="whitespace-pre-wrap break-all">{value}</pre>
      </div>
      <DomeButton variant="secondary" size="sm" onClick={copy} className="w-full">
        {copied
          ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-green-500" />Copiado</>
          : <><Copy className="w-3.5 h-3.5 mr-1.5" />{`Copiar config (${label})`}</>}
      </DomeButton>
    </div>
  );
}

export default function DomeMcpServerSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpStatus>({ running: false, port: null, sessions: [] });
  const [portInput, setPortInput] = useState('37214');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgePath, setBridgePath] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await window.electron?.domeMcp?.status?.();
      if (s) {
        setStatus(s);
        if (s.port) setPortInput(String(s.port));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    window.electron?.domeMcp?.bridgePath?.().then((p) => { if (p) setBridgePath(p); }).catch(() => {});
    return () => clearInterval(id);
  }, [refreshStatus]);

  async function handleToggle(enabled: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (enabled) {
        const result = await window.electron?.domeMcp?.start?.(Number(portInput) || 37214);
        if (!result?.success) setError(result?.error ?? t('dome_mcp.error_start'));
      } else {
        const result = await window.electron?.domeMcp?.stop?.();
        if (!result?.success) setError(result?.error ?? t('dome_mcp.error_stop'));
      }
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('dome_mcp.error_generic'));
    } finally {
      setLoading(false);
    }
  }

  const activePort = status.port ?? Number(portInput) ?? 37214;

  const cursorConfig = JSON.stringify(
    { mcpServers: { dome: { url: `http://localhost:${activePort}/mcp` } } },
    null, 2,
  );

  // Claude Desktop (older): stdio bridge via node
  const claudeStdioConfig = bridgePath
    ? JSON.stringify(
        { mcpServers: { dome: { command: 'node', args: [bridgePath], env: { DOME_MCP_PORT: String(activePort) } } } },
        null, 2,
      )
    : null;

  // Claude Desktop (≥ v0.10): HTTP transport
  const claudeHttpConfig = JSON.stringify(
    { mcpServers: { dome: { url: `http://localhost:${activePort}/mcp` } } },
    null, 2,
  );

  return (
    <div className="space-y-6">
      <DomeSubpageHeader
        title={t('dome_mcp.title')}
        subtitle={t('dome_mcp.subtitle')}
      />

      {/* Toggle + status */}
      <DomeCard>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {status.running
              ? <Wifi className="w-4 h-4 shrink-0 text-green-500" />
              : <WifiOff className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />}
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                {t('dome_mcp.enable_label')}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                {status.running
                  ? t('dome_mcp.status_running', { port: status.port })
                  : t('dome_mcp.status_stopped')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={refreshStatus}
              className="p-1.5 rounded hover:bg-[var(--dome-bg-hover)]"
              title={t('dome_mcp.refresh')}
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <DomeToggle checked={status.running} onChange={handleToggle} disabled={loading} size="sm" />
          </div>
        </div>
      </DomeCard>

      {/* Port */}
      <DomeCard>
        <label className="block">
          <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--dome-text)' }}>
            {t('dome_mcp.port_label')}
          </p>
          <input
            type="number"
            className="input w-32"
            value={portInput}
            min={1024}
            max={65535}
            disabled={loading}
            onChange={(e) => setPortInput(e.target.value)}
          />
        </label>
      </DomeCard>

      {error && <DomeCallout tone="error">{error}</DomeCallout>}

      {/* Connected clients */}
      <div className="space-y-2">
        <DomeSectionLabel>{t('dome_mcp.sessions_label')}</DomeSectionLabel>
        <DomeCard>
          {status.sessions.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {status.running ? t('dome_mcp.no_sessions') : t('dome_mcp.server_stopped_hint')}
            </p>
          ) : (
            <div className="space-y-1">
              {status.sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 shrink-0 text-green-500" />
                  <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                    {s.clientName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </DomeCard>
      </div>

      {/* Config blocks — always visible so user can copy before starting */}
      <div className="space-y-2">
        <DomeSectionLabel>{t('dome_mcp.config_label')}</DomeSectionLabel>
        <DomeCard className="space-y-4">
          <CopyBlock label="Cursor / Claude Desktop ≥ v0.10 (HTTP)" value={cursorConfig} />
          {claudeStdioConfig && (
            <div
              className="border-t pt-4"
              style={{ borderColor: 'var(--dome-border)' }}
            >
              <CopyBlock label="Claude Desktop (stdio bridge)" value={claudeStdioConfig} />
              <p className="text-xs mt-2" style={{ color: 'var(--dome-text-muted)' }}>
                {t('dome_mcp.claude_desktop_note')}
              </p>
            </div>
          )}
          {!claudeStdioConfig && (
            <div
              className="border-t pt-4"
              style={{ borderColor: 'var(--dome-border)' }}
            >
              <CopyBlock label="Claude Desktop ≥ v0.10 (HTTP)" value={claudeHttpConfig} />
              <p className="text-xs mt-2" style={{ color: 'var(--dome-text-muted)' }}>
                {t('dome_mcp.claude_desktop_note')}
              </p>
            </div>
          )}
        </DomeCard>
      </div>

      <DomeCallout tone="info">{t('dome_mcp.info_hint')}</DomeCallout>
    </div>
  );
}
