import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Globe,
  Search,
  FileText,
  Database,
  Plug,
  Image,
  FileTextIcon,
} from 'lucide-react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import DomeDrawerLayout from '@/components/ui/DomeDrawerLayout';
import DomeSubpageHeader from '@/components/ui/DomeSubpageHeader';
import DomeSubpageFooter from '@/components/ui/DomeSubpageFooter';
import DomeButton from '@/components/ui/DomeButton';
import DomeStatusBadge from '@/components/ui/DomeStatusBadge';
import DomeCallout from '@/components/ui/DomeCallout';
import DomeProgressBar from '@/components/ui/DomeProgressBar';
import DomeListState from '@/components/ui/DomeListState';
import DomeSectionLabel from '@/components/ui/DomeSectionLabel';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import type { PersistentRun, PersistentRunStep } from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { statusLabel } from '@/lib/automations/run-status';

// ─── Shared helpers (subset of ChatToolCard logic, dependency-free) ──────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_ICONS: Record<string, any> = {
  web_search: Search, web_fetch: Globe,
  resource_create: FileText, resource_get: FileText, resource_search: Search,
  call_research_agent: Search, call_library_agent: FileText,
  call_writer_agent: FileText, call_data_agent: Database,
  pdf_extract_text: FileTextIcon, pdf_get_metadata: FileTextIcon,
  pdf_summarize: FileTextIcon, pdf_extract_tables: FileTextIcon,
  image_crop: Image, image_thumbnail: Image,
};

function getIconForTool(name: string) {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  const n = (name || '').toLowerCase();
  if (n.includes('postgres') || n.includes('sql') || n.includes('database')) return Database;
  if (n.startsWith('mcp')) return Plug;
  return Globe;
}

function getLabelForTool(name: string): string {
  const key = `runLog.tools.${name}`;
  const translated = i18n.t(key);
  if (translated !== key) return translated;
  return name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || name;
}

function formatArgsSummary(args: Record<string, unknown>): string {
  const parts = Object.entries(args || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  const joined = parts.join(', ');
  return joined.length > 70 ? joined.slice(0, 70) + '…' : joined;
}

function parseJson(raw: unknown): unknown {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

// ─── JsonPrettyPrinter (same as ChatToolCard) ─────────────────────────────
// Note: JSON syntax highlighting colors (#f59e0b for boolean, #10b981 for number)
// are code decoration colors, not theme colors. No CSS variables exist for these.
export function JsonPrettyPrinter({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span style={{ color: 'var(--tertiary-text)' }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: 'var(--warning)' }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: 'var(--success)' }}>{value}</span>;
  if (typeof value === 'string') return <span style={{ color: 'var(--secondary-text)' }}>"{value}"</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--tertiary-text)' }}>[]</span>;
    return (
      <span>
        {'[\u200B'}
        <span style={{ paddingLeft: 16 * (depth + 1) }}>
          {value.map((item, i) => (
            <div key={i} style={{ paddingLeft: 16, background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-hover) 50%, transparent)' }}>
              <JsonPrettyPrinter value={item} depth={depth + 1} />
              {i < value.length - 1 && <span style={{ color: 'var(--tertiary-text)' }}>,</span>}
            </div>
          ))}
        </span>
        {']'}
      </span>
    );
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'var(--tertiary-text)' }}>{'{}'}</span>;
    return (
      <div>
        {entries.map(([k, v], i) => (
          <div key={k} style={{ display: 'flex', gap: 6, padding: '2px 6px', borderRadius: 3, background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-hover) 50%, transparent)' }}>
            <span style={{ color: 'var(--accent)', fontWeight: 500, flexShrink: 0 }}>{k}:</span>
            <span style={{ wordBreak: 'break-word', minWidth: 0 }}>
              <JsonPrettyPrinter value={v} depth={depth + 1} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(value)}</span>;
}

// ─── RunStepCard ─────────────────────────────────────────────────────────────

export function RunStepCard({ step }: { step: PersistentRunStep }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const isToolCall = step.stepType === 'tool_call' || step.stepType === 'tool';
  const isThinking = step.stepType === 'thinking';
  const isMessage = step.stepType === 'message' || step.stepType === 'output';
  const isError = step.status === 'failed' || step.status === 'error' || step.stepType === 'error';
  const isCancelled = step.status === 'cancelled';
  const isWaitingApproval = step.status === 'waiting_approval';

  const toolName = isToolCall ? step.title : '';
  const Icon = isToolCall ? getIconForTool(toolName) : isThinking ? Clock : isMessage ? FileText : Globe;
  const label = isToolCall ? getLabelForTool(toolName) : step.title;

  // Parse tool args from metadata
  const toolArgs = useMemo(() => {
    if (!isToolCall) return {};
    const meta = step.metadata || {};
    if (meta.arguments && typeof meta.arguments === 'object') return meta.arguments as Record<string, unknown>;
    if (meta.args && typeof meta.args === 'object') return meta.args as Record<string, unknown>;
    return {};
  }, [isToolCall, step.metadata]);

  const argsSummary = isToolCall ? formatArgsSummary(toolArgs as Record<string, unknown>) : '';

  const parsedContent = useMemo(() => parseJson(step.content), [step.content]);

  const statusIcon = isError
    ? <XCircle size={13} style={{ color: 'var(--error)', flexShrink: 0 }} />
    : isCancelled
      ? <XCircle size={13} className="opacity-60" style={{ color: 'var(--tertiary-text)', flexShrink: 0 }} />
      : isWaitingApproval
        ? <Clock size={13} className="opacity-80" style={{ color: 'var(--tertiary-text)', flexShrink: 0 }} />
    : step.status === 'running'
      ? <Loader2 size={13} className="animate-spin opacity-80" style={{ color: 'var(--tertiary-text)', flexShrink: 0 }} />
      : step.status === 'completed' || step.status === 'done'
        ? <CheckCircle2 size={13} className="opacity-70" style={{ color: 'var(--tertiary-text)', flexShrink: 0 }} />
        : null;

  // Render content based on type
  const renderContent = () => {
    if (!step.content && !isError) return null;

    if (isError || isCancelled || isMessage || isThinking) {
      const text = typeof step.content === 'string' ? step.content : JSON.stringify(step.content || '', null, 2);
      return (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{
            background: isError
              ? 'color-mix(in srgb, var(--error) 8%, transparent)'
              : isCancelled
                ? 'color-mix(in srgb, var(--bg-hover) 80%, transparent)'
                : 'var(--bg-tertiary)',
          }}
        >
          <MarkdownRenderer content={text} />
        </div>
      );
    }

    if (isToolCall) {
      if (showRaw) {
        const raw = typeof step.content === 'string' ? step.content : JSON.stringify(step.content, null, 2);
        return (
          <pre className="mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-64"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--secondary-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {raw}
          </pre>
        );
      }

      if (parsedContent !== null && typeof parsedContent === 'object') {
        return (
          <div className="mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-72"
            style={{ background: 'var(--bg-tertiary)' }}>
            <JsonPrettyPrinter value={parsedContent} />
          </div>
        );
      }

      if (typeof step.content === 'string') {
        return (
          <div className="mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-64"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--secondary-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {step.content}
          </div>
        );
      }
    }

    return null;
  };

  const hasContent = Boolean(step.content);

  const panelBody = hasContent ? (
    <div className="px-3 pb-3 bg-[var(--bg)]">
      {isToolCall ? (
        <div className="flex justify-end pb-2">
          <DomeButton type="button" variant="outline" size="xs" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? t('runLog.view_pretty') : t('runLog.view_raw')}
          </DomeButton>
        </div>
      ) : null}
      {renderContent()}
    </div>
  ) : undefined;

  return (
    <div
      className="rounded-md border border-[var(--border)] overflow-hidden bg-[var(--bg-secondary)]"
    >
      <DomeCollapsibleRow
        expanded={expanded}
        onExpandedChange={setExpanded}
        triggerClassName="px-3 py-2 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
        trigger={
          <>
            <Icon size={13} className="shrink-0 opacity-60" style={{ color: 'var(--tertiary-text)' }} />
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-0.5 min-w-0 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--tertiary-text)' }}>
                  {toolName || step.stepType}
                </span>
                <span className="text-sm font-normal leading-snug break-words text-[var(--primary-text)]">{label}</span>
              </div>
              {argsSummary ? (
                <p className="text-[11px] mt-0.5 line-clamp-2 text-[var(--tertiary-text)]">{argsSummary}</p>
              ) : null}
            </div>
            <div className="flex items-center shrink-0">{statusIcon}</div>
          </>
        }
      >
        {panelBody}
      </DomeCollapsibleRow>
    </div>
  );
}

export { statusLabel, statusColor } from '@/lib/automations/run-status';

export function formatRunDate(ts?: number | null) {
  if (!ts) return i18n.t('runLog.em_dash');
  return new Date(ts).toLocaleString(getDateTimeLocaleTag(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDuration(startedAt?: number, finishedAt?: number | null): string {
  if (!startedAt) return i18n.t('runLog.em_dash');
  const end = finishedAt || Date.now();
  const secs = Math.round((end - startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}

export function RunProgressBar({ run }: { run: PersistentRun }) {
  const progress = getRunProgress(run);
  if (!progress) return null;

  if (progress.mode === 'determinate') {
    return (
      <DomeProgressBar
        value={progress.percent ?? 0}
        max={100}
        size="sm"
        aria-label={statusLabel(run.status)}
      />
    );
  }

  return <DomeProgressBar indeterminate size="sm" aria-label={statusLabel(run.status)} />;
}

// ─── RunLogView ───────────────────────────────────────────────────────────────

interface RunLogViewProps {
  run: PersistentRun;
  onClose: () => void;
}

export default function RunLogView({ run, onClose }: RunLogViewProps) {
  const { t } = useTranslation();
  const steps = run.steps ?? [];
  const toolSteps = steps.filter((s) => s.stepType === 'tool_call' || s.stepType === 'tool');
  const otherSteps = steps.filter((s) => s.stepType !== 'tool_call' && s.stepType !== 'tool');
  const progress = getRunProgress(run);

  const isRunning = run.status === 'running' || run.status === 'queued';

  const subtitle = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--tertiary-text)]">
      <span>
        {t('runLog.started')} {formatRunDate(run.startedAt)}
      </span>
      {run.finishedAt ? (
        <span>
          {t('runLog.finished')} {formatRunDate(run.finishedAt)}
        </span>
      ) : null}
      <span>
        {t('runLog.duration')} {formatDuration(run.startedAt, run.finishedAt)}
      </span>
      <span>{steps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: steps.length })}</span>
      {progress?.mode === 'determinate' ? (
        <span className="font-medium text-[var(--accent)]">
          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
        </span>
      ) : null}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="ml-auto h-full flex flex-col min-h-0 w-[min(720px,92vw)] border-l border-[var(--border)] bg-[var(--bg)] shadow-[-4px_0_16px_rgba(0,0,0,0.06)]"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <DomeDrawerLayout
          className="h-full border-0 shadow-none bg-transparent"
          header={
            <DomeSubpageHeader
              className="bg-[var(--bg-secondary)]"
              title={run.title || run.id}
              subtitle={subtitle}
              trailing={
                <>
                  <DomeStatusBadge status={run.status} />
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={onClose}
                    aria-label={t('runLog.close_panel')}
                  >
                    <X className="w-[18px] h-[18px]" aria-hidden />
                  </DomeButton>
                </>
              }
            />
          }
          afterHeader={
            isRunning ? (
              <div className="shrink-0 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg)]">
                <RunProgressBar run={run} />
              </div>
            ) : undefined
          }
          footer={
            <DomeSubpageFooter
              className="bg-[var(--bg-secondary)]"
              leading={<span className="text-[11px] text-[var(--tertiary-text)]">ID: {run.id}</span>}
              trailing={
                <DomeButton type="button" variant="secondary" size="sm" onClick={onClose}>
                  {t('runLog.close')}
                </DomeButton>
              }
            />
          }
        >
          <div className="px-5 py-4 space-y-5">
            {run.error ? (
              <DomeCallout tone="error" title={t('runLog.error_title')}>
                <p className="font-mono text-[11px] whitespace-pre-wrap break-all">{run.error}</p>
              </DomeCallout>
            ) : null}

            {run.outputText ? (
              <div>
                <DomeSectionLabel compact={false} className="mb-2">
                  {t('runLog.response')}
                </DomeSectionLabel>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-sm">
                  <MarkdownRenderer content={run.outputText} />
                </div>
              </div>
            ) : null}

            {toolSteps.length > 0 ? (
              <div>
                <DomeSectionLabel compact={false} className="mb-2">
                  {t('runLog.tools_used', { count: toolSteps.length })}
                </DomeSectionLabel>
                <div className="space-y-2">
                  {toolSteps.map((step) => (
                    <RunStepCard key={step.id} step={step} />
                  ))}
                </div>
              </div>
            ) : null}

            {otherSteps.length > 0 ? (
              <div>
                <DomeSectionLabel compact={false} className="mb-2">
                  {t('runLog.agent_steps', { count: otherSteps.length })}
                </DomeSectionLabel>
                <div className="space-y-2">
                  {otherSteps.map((step) => (
                    <RunStepCard key={step.id} step={step} />
                  ))}
                </div>
              </div>
            ) : null}

            {steps.length === 0 && !run.outputText && !run.error ? (
              isRunning ? (
                <DomeListState variant="loading" loadingLabel={t('runLog.executing')} fullHeight />
              ) : (
                <DomeListState variant="empty" title={t('runLog.no_steps')} fullHeight />
              )
            ) : null}

            {run.summary ? (
              <div>
                <DomeSectionLabel compact={false} className="mb-2">
                  {t('runLog.summary')}
                </DomeSectionLabel>
                <p className="text-sm text-[var(--secondary-text)]">{run.summary}</p>
              </div>
            ) : null}
          </div>
        </DomeDrawerLayout>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
