import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { getDateTimeLocaleTag } from '@/lib/i18n';
import {
  X,
  ChevronDown,
  ChevronRight,
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
import type { PersistentRun, PersistentRunStep } from '@/lib/automations/api';

// ─── Shared helpers (subset of ChatToolCard logic, dependency-free) ──────────

type ToolCategory = 'search' | 'file' | 'agent' | 'db' | 'mcp' | 'default';

const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: '#3b82f6',
  file: '#10b981',
  agent: '#8b5cf6',
  db: '#f59e0b',
  mcp: '#6b7280',
  default: '#6b7280',
};

function getCategory(name: string): ToolCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('search') || n.includes('web_fetch') || n.includes('fetch')) return 'search';
  if (n.includes('pdf') || n.includes('file') || n.includes('resource') || n.includes('image')) return 'file';
  if (n.includes('agent') || n.includes('call_') || n.includes('delegate')) return 'agent';
  if (n.includes('postgres') || n.includes('sql') || n.includes('query') || n.includes('database')) return 'db';
  if (n.startsWith('mcp') || n.includes('mcp_')) return 'mcp';
  return 'default';
}

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

export function JsonPrettyPrinter({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span style={{ color: 'var(--tertiary-text)' }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: '#f59e0b' }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: '#10b981' }}>{value}</span>;
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
  const isError = step.status === 'failed' || step.stepType === 'error';

  const toolName = isToolCall ? step.title : '';
  const Icon = isToolCall ? getIconForTool(toolName) : isThinking ? Clock : isMessage ? FileText : Globe;
  const label = isToolCall ? getLabelForTool(toolName) : step.title;
  const category = isToolCall ? getCategory(toolName) : 'default';
  const accentColor = isError ? 'var(--error)' : CATEGORY_COLORS[category];

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
    : step.status === 'running'
      ? <Loader2 size={13} className="animate-spin" style={{ color: accentColor, flexShrink: 0 }} />
      : step.status === 'completed' || step.status === 'done'
        ? <CheckCircle2 size={13} style={{ color: '#10b981', flexShrink: 0 }} />
        : null;

  // Render content based on type
  const renderContent = () => {
    if (!step.content && !isError) return null;

    if (isError || isMessage || isThinking) {
      const text = typeof step.content === 'string' ? step.content : JSON.stringify(step.content || '', null, 2);
      return (
        <div
          className="mt-2 rounded-lg p-3 text-xs"
          style={{ background: isError ? 'color-mix(in srgb, var(--error) 8%, transparent)' : 'var(--bg-tertiary)' }}
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

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
        style={{ background: 'var(--bg-secondary)' }}
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <Icon size={14} style={{ color: accentColor, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: accentColor }}>
              {toolName || step.stepType}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>
              {label}
            </span>
          </div>
          {argsSummary && (
            <p className="text-[11px] truncate mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
              {argsSummary}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {statusIcon}
          {hasContent && (
            <>
              {isToolCall && expanded && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--tertiary-text)' }}
                >
                  {showRaw ? t('runLog.view_pretty') : t('runLog.view_raw')}
                </button>
              )}
              {expanded
                ? <ChevronDown size={14} style={{ color: 'var(--tertiary-text)' }} />
                : <ChevronRight size={14} style={{ color: 'var(--tertiary-text)' }} />
              }
            </>
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && hasContent && (
        <div className="px-3 pb-3" style={{ background: 'var(--bg)' }}>
          {renderContent()}
        </div>
      )}
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

export function statusLabel(status: string) {
  const key = `runLog.status.${status}`;
  const translated = i18n.t(key);
  return translated !== key ? translated : status;
}

export function statusColor(status: string): string {
  if (status === 'completed') return '#10b981';
  if (status === 'failed') return 'var(--error)';
  if (status === 'running') return 'var(--accent)';
  if (status === 'cancelled') return 'var(--tertiary-text)';
  return 'var(--secondary-text)';
}

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

  const isRunning = run.status === 'running' || run.status === 'queued';

  return (
    /* Slide-over overlay */
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="ml-auto h-full flex flex-col"
        style={{
          width: 'min(720px, 92vw)',
          background: 'var(--bg)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
          animation: 'slideInRight 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
                {run.title || run.id}
              </h2>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: `color-mix(in srgb, ${statusColor(run.status)} 12%, transparent)`,
                  color: statusColor(run.status),
                }}
              >
                {statusLabel(run.status)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.started')} {formatRunDate(run.startedAt)}
              </span>
              {run.finishedAt && (
                <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                  {t('runLog.finished')} {formatRunDate(run.finishedAt)}
                </span>
              )}
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.duration')} {formatDuration(run.startedAt, run.finishedAt)}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
                {steps.length === 1 ? t('runLog.step_singular') : t('runLog.step_plural', { count: steps.length })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-[var(--bg-hover)] shrink-0"
            style={{ color: 'var(--tertiary-text)' }}
            aria-label={t('runLog.close_panel')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress bar for running */}
        {isRunning && (
          <div className="h-0.5 w-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
            <div
              className="h-full animate-pulse"
              style={{ width: '60%', background: 'var(--accent)', transition: 'width 1s ease' }}
            />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Error */}
          {run.error && (
            <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--error)', background: 'color-mix(in srgb, var(--error) 8%, transparent)', color: 'var(--error)' }}>
              <p className="font-semibold mb-1">{t('runLog.error_title')}</p>
              <p className="text-xs font-mono">{run.error}</p>
            </div>
          )}

          {/* Output text */}
          {run.outputText && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.response')}
              </p>
              <div
                className="rounded-xl border p-4 text-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
              >
                <MarkdownRenderer content={run.outputText} />
              </div>
            </div>
          )}

          {/* Tool calls */}
          {toolSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.tools_used', { count: toolSteps.length })}
              </p>
              <div className="space-y-2">
                {toolSteps.map((step) => (
                  <RunStepCard key={step.id} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Other steps (messages, thinking, etc.) */}
          {otherSteps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.agent_steps', { count: otherSteps.length })}
              </p>
              <div className="space-y-2">
                {otherSteps.map((step) => (
                  <RunStepCard key={step.id} step={step} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {steps.length === 0 && !run.outputText && !run.error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {isRunning ? (
                <>
                  <Loader2 size={32} className="animate-spin mb-3" style={{ color: 'var(--accent)' }} />
                  <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{t('runLog.executing')}</p>
                </>
              ) : (
                <p className="text-sm" style={{ color: 'var(--tertiary-text)' }}>{t('runLog.no_steps')}</p>
              )}
            </div>
          )}

          {/* Metadata */}
          {run.summary && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--tertiary-text)' }}>
                {t('runLog.summary')}
              </p>
              <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{run.summary}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="shrink-0 px-5 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
            ID: {run.id}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--secondary-text)' }}
          >
            {t('runLog.close')}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}
