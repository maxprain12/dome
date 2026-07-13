import { HugeiconsIcon } from '@hugeicons/react';
import {
  CopyIcon as Copy,
  CheckmarkCircle02Icon as CheckCircle2,
  Wifi01Icon as Wifi,
  WifiOff01Icon as WifiOff,
  RefreshIcon as RefreshCw,
  ServerStack01Icon as Server,
  AlertCircleIcon as AlertCircle,
  InformationCircleIcon as Info,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

import SubpageHeader from '@/components/shared/SubpageHeader';
import SettingsPanel from '@/components/settings/SettingsPanel';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
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
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground"
      >
        <pre className="whitespace-pre-wrap break-all">{value}</pre>
      </div>
      <Button variant="secondary"
  onClick={copy}
  className="w-full"
  size="sm">
        {copied
          ? <><HugeiconsIcon icon={CheckCircle2} className="size-3.5 mr-1.5 text-[var(--success)]" />Copiado</>
          : <><HugeiconsIcon icon={Copy} className="size-3.5 mr-1.5" />{`Copiar config (${label})`}</>}
      </Button>
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
    <SettingsPanel className="!gap-6">
      <SubpageHeader>
  <SubpageHeader.Title>{t('dome_mcp.title')}</SubpageHeader.Title>
  <SubpageHeader.Subtitle>{t('dome_mcp.subtitle')}</SubpageHeader.Subtitle>
</SubpageHeader>

      {/* Toggle + status */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {status.running
              ? <HugeiconsIcon icon={Wifi} className="size-4 shrink-0 text-[var(--success)]" />
              : <HugeiconsIcon icon={WifiOff} className="size-4 shrink-0 text-muted-foreground" />}
            <div>
              <p className="text-sm font-medium text-foreground">
                {t('dome_mcp.enable_label')}
              </p>
              <p className="text-xs mt-0.5 text-muted-foreground">
                {status.running
                  ? t('dome_mcp.status_running', { port: status.port })
                  : t('dome_mcp.status_stopped')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost"
              type="button"
              onClick={refreshStatus}
              className="p-1.5 rounded hover:bg-accent text-muted-foreground"
              title={t('dome_mcp.refresh')}
            >
              <HugeiconsIcon icon={RefreshCw} className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Switch checked={status.running} onCheckedChange={handleToggle} disabled={loading} size="sm" />
          </div>
        </div>
      </Card>

      {/* Port */}
      <Card className="p-4">
        <label className="block">
          <p className="text-sm font-medium mb-1.5 text-foreground">
            {t('dome_mcp.port_label')}
          </p>
          <Input
            type="number"
            className="w-32"
            value={portInput}
            min={1024}
            max={65535}
            disabled={loading}
            onChange={(e) => setPortInput(e.target.value)}
          />
        </label>
      </Card>

      {error && <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircle} aria-hidden /><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}

      {/* Connected clients */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('dome_mcp.sessions_label')}</p>
        <Card className="p-4">
          {status.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {status.running ? t('dome_mcp.no_sessions') : t('dome_mcp.server_stopped_hint')}
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {status.sessions.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <HugeiconsIcon icon={Server} className="size-3.5 shrink-0 text-[var(--success)]" />
                  <span className="text-sm font-medium text-foreground">
                    {s.clientName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Config blocks — always visible so user can copy before starting */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('dome_mcp.config_label')}</p>
        <Card className="p-4 flex flex-col gap-4">
          <CopyBlock label="Cursor / Claude Desktop ≥ v0.10 (HTTP)" value={cursorConfig} />
          {claudeStdioConfig && (
            <div
              className="border-t pt-4 border-border"
            >
              <CopyBlock label="Claude Desktop (stdio bridge)" value={claudeStdioConfig} />
              <p className="text-xs mt-2 text-muted-foreground">
                {t('dome_mcp.claude_desktop_note')}
              </p>
            </div>
          )}
          {!claudeStdioConfig && (
            <div
              className="border-t pt-4 border-border"
            >
              <CopyBlock label="Claude Desktop ≥ v0.10 (HTTP)" value={claudeHttpConfig} />
              <p className="text-xs mt-2 text-muted-foreground">
                {t('dome_mcp.claude_desktop_note')}
              </p>
            </div>
          )}
        </Card>
      </div>

      <Alert role="note"><HugeiconsIcon icon={Info} aria-hidden /><AlertDescription className="text-xs">{t('dome_mcp.info_hint')}</AlertDescription></Alert>
    </SettingsPanel>
  );
}
