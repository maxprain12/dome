import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  CopyIcon,
  InformationCircleIcon,
  RefreshIcon,
  ServerStack01Icon,
  Wifi01Icon,
  WifiOff01Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';

interface McpStatus {
  running: boolean;
  port: number | null;
  sessions: { clientName: string }[];
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy()}>
          {copied ? (
            <HugeiconsIcon icon={CheckmarkCircle02Icon} data-icon="inline-start" className="text-success" />
          ) : (
            <HugeiconsIcon icon={CopyIcon} data-icon="inline-start" />
          )}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
        <pre className="whitespace-pre-wrap break-all">{value}</pre>
      </div>
    </div>
  );
}

export default function DomeMcpSection() {
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
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 3000);
    window.electron?.domeMcp
      ?.bridgePath?.()
      .then((p) => {
        if (p) setBridgePath(p);
      })
      .catch(() => {});
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

  const httpConfig = JSON.stringify(
    { mcpServers: { dome: { url: `http://localhost:${activePort}/mcp` } } },
    null,
    2,
  );

  // Claude Desktop (older): stdio bridge via node
  const claudeStdioConfig = bridgePath
    ? JSON.stringify(
        {
          mcpServers: {
            dome: { command: 'node', args: [bridgePath], env: { DOME_MCP_PORT: String(activePort) } },
          },
        },
        null,
        2,
      )
    : null;

  return (
    <SettingsSurface
      icon={ServerStack01Icon}
      title={t('dome_mcp.title')}
      description={t('dome_mcp.subtitle')}
    >
      <SettingsGroup>
        <SettingsRow
          title={
            <span className="flex items-center gap-2">
              <HugeiconsIcon
                icon={status.running ? Wifi01Icon : WifiOff01Icon}
                className={status.running ? 'text-success' : 'text-muted-foreground'}
              />
              {t('dome_mcp.enable_label')}
            </span>
          }
          description={
            status.running
              ? t('dome_mcp.status_running', { port: status.port })
              : t('dome_mcp.status_stopped')
          }
          control={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void refreshStatus()}
                title={t('dome_mcp.refresh')}
                aria-label={t('dome_mcp.refresh')}
              >
                <HugeiconsIcon
                  icon={RefreshIcon}
                  className={loading ? 'animate-spin motion-reduce:animate-none' : undefined}
                />
              </Button>
              <Switch
                checked={status.running}
                onCheckedChange={(v) => void handleToggle(v)}
                disabled={loading}
                aria-label={t('dome_mcp.enable_label')}
              />
            </>
          }
        />
        <SettingsRow title={t('dome_mcp.port_label')} htmlFor="dome-mcp-port">
          <Field className="max-w-40">
            <FieldLabel htmlFor="dome-mcp-port" className="sr-only">
              {t('dome_mcp.port_label')}
            </FieldLabel>
            <Input
              id="dome-mcp-port"
              type="number"
              value={portInput}
              min={1024}
              max={65535}
              disabled={loading}
              onChange={(e) => setPortInput(e.target.value)}
            />
          </Field>
        </SettingsRow>
      </SettingsGroup>

      {error ? (
        <Alert variant="destructive" role="note">
          <HugeiconsIcon icon={AlertCircleIcon} aria-hidden />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsGroup
        title={t('dome_mcp.sessions_label')}
        actions={
          status.sessions.length > 0 ? (
            <Badge variant="secondary">{status.sessions.length}</Badge>
          ) : undefined
        }
      >
        <div className="px-4 py-3">
          {status.sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {status.running ? t('dome_mcp.no_sessions') : t('dome_mcp.server_stopped_hint')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {status.sessions.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm font-medium">
                  <HugeiconsIcon icon={ServerStack01Icon} className="shrink-0 text-success" />
                  {s.clientName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('dome_mcp.config_label')}>
        <div className="flex flex-col gap-4 px-4 py-4">
          <CopyBlock label="Cursor / Claude Desktop ≥ v0.10 (HTTP)" value={httpConfig} />
          <div className="border-t pt-4">
            {claudeStdioConfig ? (
              <CopyBlock label="Claude Desktop (stdio bridge)" value={claudeStdioConfig} />
            ) : (
              <CopyBlock label="Claude Desktop ≥ v0.10 (HTTP)" value={httpConfig} />
            )}
            <p className="mt-2 text-xs text-muted-foreground">{t('dome_mcp.claude_desktop_note')}</p>
          </div>
        </div>
      </SettingsGroup>

      <Alert role="note">
        <HugeiconsIcon icon={InformationCircleIcon} aria-hidden />
        <AlertDescription className="text-xs">{t('dome_mcp.info_hint')}</AlertDescription>
      </Alert>
    </SettingsSurface>
  );
}
