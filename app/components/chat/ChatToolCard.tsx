
import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  ChevronRight,
  PlusCircle,
  Users,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard from './ArtifactCard';
import ChatTodoList, { parseTodos } from './ChatTodoList';
import { useManyStore } from '@/lib/store/useManyStore';
import { parseContentImages, parseImageResult } from '@/lib/chat/image-tool-utils';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import { getSubagentDisplayLabel } from '@/lib/chat/toolCatalog';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { JsonPrettyPrinterRoot } from '@/lib/chat/jsonPrettyPrinter';
import { isFilesystemTreeTool, parseTreeToolSummary } from '@/lib/chat/treeToolSummary';
import { stableStringHash } from '@/lib/utils/stableStringHash';
import './chat-tool-card.css';

/**
 * ChatToolCard - Polished display for tool calls with category color system
 */

export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error';
  result?: unknown;
  error?: string;
  /** Name of the subagent that produced this call (deepagents `task` delegation). */
  agentName?: string;
}

export type ChatToolSurfaceVariant = 'default' | 'many';

interface ChatToolCardProps {
  toolCall: ToolCallData;
  className?: string;
  surfaceVariant?: ChatToolSurfaceVariant;
}

// Config, parsers y highlights extraídos (03/T02) — misma API pública.
import {
  type ToolCategory,
  CATEGORY_COLORS,
  getCategory,
  getIconForTool,
} from './tool-card/toolCardConfig';
import {
  parseDocumentResult,
  parseArtifactResult,
  parseResourceItems,
  formatArgsSummary,
  smartToolSummary,
  getCodegenPreview,
} from './tool-card/toolResultParsers';
import {
  renderToolSuccessHighlight,
  CodegenPreview,
  renderTreeToolSummary,
} from './tool-card/ToolResultHighlights';

function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
}

function dispatchSoftConfirm(approved: boolean) {
  const text = approved ? 'Sí, confirmo.' : 'No, cancela.';
  window.dispatchEvent(new CustomEvent('dome:quick-reply', { detail: { text } }));
}

export default function ChatToolCard({ toolCall, className = '', surfaceVariant = 'default' }: ChatToolCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const Icon = getIconForTool(toolCall.name);
  const label = getToolDisplayLabelForCall(toolCall, t);
  const category = getCategory(toolCall.name);
  const accentColor = CATEGORY_COLORS[category];

  // Subagent delegation: explicit relay (agentName) or the deepagents `task` target.
  const rawSubagentKey =
    toolCall.agentName ||
    (toolCall.name === 'task' || toolCall.name === 'delegate_to_agent'
      ? String(
          (toolCall.arguments?.subagent_type as string) ??
            (toolCall.arguments?.subagentType as string) ??
            (toolCall.arguments?.agent as string) ??
            (toolCall.arguments?.name as string) ??
            '',
        )
      : '');
  const subagentName = rawSubagentKey ? getSubagentDisplayLabel(rawSubagentKey, t) : '';
  const showSubagentBadge =
    !!subagentName && toolCall.name !== 'task' && toolCall.name !== 'delegate_to_agent';

  const documentItems = useMemo(() => parseDocumentResult(toolCall.result), [toolCall.result]);
  const artifactItems = useMemo(() => parseArtifactResult(toolCall.result), [toolCall.result]);
  const imageItems = useMemo(() => parseImageResult(toolCall.result), [toolCall.result]);
  const contentImages = useMemo(() => parseContentImages(toolCall.result), [toolCall.result]);
  const resourceItems = useMemo(() => parseResourceItems(toolCall.name, toolCall.result), [toolCall.name, toolCall.result]);
  const treeToolSummary = useMemo(() => {
    if (!isFilesystemTreeTool(toolCall.name)) return null;
    return parseTreeToolSummary(toolCall.result);
  }, [toolCall.name, toolCall.result]);
  const pinnedIds = useMemo(() => new Set(pinnedResources.map((r) => r.id)), [pinnedResources]);

  const parsedResult = useMemo(() => {
    if (!toolCall.result) return null;
    if (typeof toolCall.result === 'object') return toolCall.result;
    if (typeof toolCall.result === 'string') {
      try { return JSON.parse(toolCall.result); } catch { return null; }
    }
    return null;
  }, [toolCall.result]);

  // write_todos → dedicated checklist UI instead of a generic JSON tool card
  if (toolCall.name === 'write_todos') {
    const todos = parseTodos(toolCall.arguments);
    if (todos.length > 0) return <ChatTodoList todos={todos} />;
  }

  const resultText = formatToolResult(toolCall.result);
  const isPending = toolCall.status === 'pending' || toolCall.status === 'running';
  const argsSummary = formatArgsSummary(toolCall.arguments);

  // Soft confirmation requested by tool (needs_confirmation status)
  const needsConfirmation = (parsedResult as Record<string, unknown> | null)?.status === 'needs_confirmation';

  const renderResultContent = () => {
    // Inline approval UI for soft confirmations (needs_confirmation pattern)
    if (needsConfirmation && toolCall.status === 'success') {
      const msg = (parsedResult as Record<string, unknown>)?.error;
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '8px 10px',
            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          <p style={{ fontSize: 13, color: 'var(--secondary-text)', margin: 0 }}>
            {typeof msg === 'string' ? msg : 'Esta acción requiere confirmación.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => dispatchSoftConfirm(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => dispatchSoftConfirm(true)}
            >
              Confirmar
            </button>
          </div>
        </div>
      );
    }

    if (toolCall.error) {
      return (
        <div
          style={{
            fontSize: 12,
            color: 'var(--error)',
            padding: '6px 8px',
            background: 'color-mix(in srgb, var(--error) 8%, transparent)',
            borderRadius: 4,
          }}
        >
          {toolCall.error}
        </div>
      );
    }

    if (!showRawJson) {
      if (treeToolSummary) {
        return renderTreeToolSummary(treeToolSummary, t);
      }
      const codegen = getCodegenPreview(toolCall.name, toolCall.arguments);
      if (codegen) {
        return <CodegenPreview preview={codegen} t={t} />;
      }
      const highlight = renderToolSuccessHighlight(toolCall.name, toolCall.result, t);
      if (highlight) {
        return <div style={{ marginTop: 4 }}>{highlight}</div>;
      }
    }

    if (showRawJson) {
      return (
        <pre className="chat-tool-result-pre">
          {resultText}
        </pre>
      );
    }

    if (documentItems && documentItems.length > 0) {
      const counts = new Map<string, number>();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {documentItems.map((item) => {
            const h = stableStringHash(JSON.stringify(item));
            const ord = (counts.get(h) ?? 0) + 1;
            counts.set(h, ord);
            return (
            <div key={`doc:${h}:${ord}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.metadata?.title != null && (
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary-text)', margin: 0 }}>
                  {String(item.metadata.title)}
                </p>
              )}
              {item.content && (
                <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
                  <MarkdownRenderer content={typeof item.content === 'string' ? item.content : ''} />
                </div>
              )}
            </div>
            );
          })}
        </div>
      );
    }

    if (artifactItems) {
      return (
        <div style={{ marginTop: 6 }}>
          <ArtifactCard artifact={artifactItems} />
        </div>
      );
    }

    if (contentImages && contentImages.length > 0) {
      const imgCounts = new Map<string, number>();
      return (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contentImages.map((item) => {
            const h = stableStringHash(item.dataUrl);
            const ord = (imgCounts.get(h) ?? 0) + 1;
            imgCounts.set(h, ord);
            const figureN = ord;
            return (
            <div key={`fig:${h}:${ord}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.label && (
                <p style={{ fontSize: 12, color: 'var(--secondary-text)', margin: 0 }}>{item.label}</p>
              )}
              <img
                src={item.dataUrl}
                alt={item.label || `Figure ${figureN}`}
                style={{
                  maxWidth: 280,
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              />
            </div>
            );
          })}
        </div>
      );
    }

    if (imageItems) {
      return (
        <div style={{ marginTop: 6, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <img
            src={imageItems.dataUrl}
            alt={imageItems.alt || t('chat.tool_image_processed')}
            style={{
              maxWidth: 200,
              maxHeight: 200,
              objectFit: 'contain',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
            <p style={{ fontWeight: 600, color: 'var(--primary-text)', margin: '0 0 4px' }}>{t('chat.tool_image_processed')}</p>
            <p style={{ opacity: 0.7, margin: 0 }}>{t('chat.tool_image_expand')}</p>
          </div>
        </div>
      );
    }

    // Resource list/search results with add-to-context buttons
    if (resourceItems && resourceItems.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {resourceItems.map((item) => {
            const isPinned = pinnedIds.has(item.id);
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '5px 6px',
                  borderRadius: 5,
                  border: '1px solid var(--border)',
                  background: isPinned ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'var(--bg-tertiary)',
                }}
              >
                <FileText style={{ width: 12, height: 12, flexShrink: 0, marginTop: 2, color: 'var(--tertiary-text)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--primary-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </span>
                  {item.snippet && (
                    <span style={{ fontSize: 12, color: 'var(--tertiary-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.snippet}
                    </span>
                  )}
                </div>
                {item.similarity != null && (
                  <DomeBadge
                    label={`${Math.round(item.similarity * 100)}%`}
                    variant="soft"
                    size="xs"
                    color="var(--tertiary-text)"
                    className="shrink-0 mt-0.5"
                  />
                )}
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  iconOnly
                  onClick={() => {
                    if (isPinned) {
                      removePinnedResource(item.id);
                    } else {
                      addPinnedResource({ id: item.id, title: item.title, type: item.type });
                    }
                  }}
                  title={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
                  aria-label={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
                  className="!p-0 size-5 min-w-0 shrink-0 text-[var(--tertiary-text)] hover:text-[var(--accent)]"
                >
                  {isPinned ? (
                    <CheckCircle2 className="w-[13px] h-[13px]" />
                  ) : (
                    <PlusCircle className="w-[13px] h-[13px]" />
                  )}
                </DomeButton>
              </div>
            );
          })}
        </div>
      );
    }

    // JSON pretty view for objects/arrays
    if (parsedResult && typeof parsedResult === 'object') {
      return (
        <div
          style={{
            fontSize: 12,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            overflowY: 'auto',
            maxHeight: 256,
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
          }}
        >
          <JsonPrettyPrinterRoot value={parsedResult} />
        </div>
      );
    }

    return (
      <pre className="chat-tool-result-pre">
        {resultText}
      </pre>
    );
  };

  const hasResult = Boolean(toolCall.result || toolCall.error);
  const canExpand = !isPending && hasResult;
  const cardSummary = smartToolSummary(toolCall.name, toolCall.arguments);

  // ── Many panel: new card-based design ──────────────────────────────────────
  if (surfaceVariant === 'many') {
    const stateKey = isPending ? (toolCall.status === 'running' ? 'running' : 'pending') : toolCall.status;
    return (
      <div className={`many-tool-card-v2 state-${stateKey} ${className}`.trim()}>
        <button
          type="button"
          className="many-tool-card-v2-trigger"
          onClick={() => { if (canExpand) setExpanded((o) => !o); }}
          aria-expanded={expanded}
        >
          {/* Icon box */}
          <div className={`many-tool-card-v2-icon state-${stateKey}`}>
            {isPending
              ? <Loader2 size={12} className="many-tool-spinner animate-spin" />
              : <Icon size={14} strokeWidth={1.8} />}
          </div>

          {/* Label + summary */}
          <div className="many-tool-card-v2-copy">
            <span className="many-tool-card-v2-title">
              {label}
              {showSubagentBadge ? (
                <DomeBadge
                  label={subagentName}
                  variant="soft"
                  size="xs"
                  color="var(--accent)"
                  className="ml-1.5 align-middle"
                />
              ) : null}
            </span>
            {cardSummary ? <span className="many-tool-card-v2-summary">{cardSummary}</span> : null}
          </div>

          <div className="many-tool-card-v2-trail">
            {toolCall.status === 'success' && !isPending ? (
              <Check size={12} strokeWidth={2.4} className="many-tool-card-v2-status-icon" aria-hidden />
            ) : null}
            {toolCall.status === 'error' && !isPending ? (
              <XCircle size={12} className="many-tool-card-v2-status-icon is-error" aria-hidden />
            ) : null}
            {canExpand ? (
              <ChevronRight
                size={14}
                className={`many-tool-card-v2-chevron ${expanded ? 'expanded' : ''}`}
                aria-hidden
              />
            ) : null}
          </div>
        </button>

        {/* Expanded body */}
        {expanded && canExpand ? (
          <div className="many-tool-card-v2-body is-detail">
            {/* Args */}
            {Object.keys(toolCall.arguments).length > 0 && (
              <>
                <div className="many-tool-card-v2-section-label">Args</div>
                <dl className="many-tool-card-v2-kv" style={{ marginBottom: 10 }}>
                  {Object.entries(toolCall.arguments).slice(0, 4).map(([k, v]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{k}</dt>
                      <dd style={{ color: typeof v === 'string' ? 'var(--accent)' : typeof v === 'number' ? 'var(--info)' : 'var(--primary-text)' }}>
                        {typeof v === 'string' ? `"${v.slice(0, 120)}"` : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {/* Result */}
            {!toolCall.error && hasResult ? (
              <>
                <div className="many-tool-card-v2-section-label">Result</div>
                <div className="mb-1.5">
                  <DomeButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="!h-auto !px-0 !py-0 font-mono text-[11px] underline text-[var(--tertiary-text)] opacity-70 hover:opacity-100"
                  >
                    {showRawJson ? t('chat.formatted_view') : t('chat.view_json')}
                  </DomeButton>
                </div>
              </>
            ) : null}
            {renderResultContent()}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Default surface: original left-border style ────────────────────────────
  return (
    <div
      className={className}
      style={{
        minWidth: 0,
        maxWidth: '100%',
        fontSize: 13,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        transition: 'background 150ms ease',
      }}
    >
      <DomeCollapsibleRow
        expanded={expanded}
        onExpandedChange={(next) => {
          if (canExpand) setExpanded(next);
        }}
        disabled={isPending || !canExpand}
        triggerClassName="!px-2 !py-1.5 rounded-r-md"
        trigger={
          <>
            <div className="flex shrink-0 size-4 items-center justify-center">
              {isPending ? (
                <Loader2 className="w-[13px] h-[13px] animate-spin" style={{ color: accentColor }} />
              ) : toolCall.status === 'error' ? (
                <XCircle className="w-[13px] h-[13px] text-[var(--error)]" />
              ) : toolCall.status === 'success' ? (
                <CheckCircle2 className="w-[13px] h-[13px] text-[var(--success)]" />
              ) : (
                <Icon className="w-[13px] h-[13px] text-[var(--tertiary-text)]" />
              )}
            </div>
            <span className="flex flex-col min-w-0 flex-1">
              <span
                className="text-[13px] font-semibold leading-snug"
                style={{ color: isPending ? 'var(--primary-text)' : 'var(--secondary-text)' }}
              >
                {label}
                {showSubagentBadge ? (
                  <DomeBadge
                    label={subagentName}
                    variant="soft"
                    size="xs"
                    color="var(--accent)"
                    className="ml-1.5 align-middle"
                  />
                ) : null}
              </span>
              {argsSummary ? (
                <span className="text-[var(--tertiary-text)] leading-snug mt-px truncate text-[12px]">
                  {argsSummary}
                </span>
              ) : null}
            </span>
          </>
        }
        panelClassName="!pl-2 !pb-1.5 !ml-2 border-l border-[var(--border)]"
      >
        {canExpand ? (
          <div className="pt-1.5 pl-4">
            {!toolCall.error && hasResult ? (
              <div className="mb-1.5">
                <DomeButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="!h-auto !px-0 !py-0 font-mono text-[12px] underline text-[var(--tertiary-text)] opacity-70 hover:opacity-100"
                >
                  {showRawJson ? t('chat.formatted_view') : t('chat.view_json')}
                </DomeButton>
              </div>
            ) : null}
            {renderResultContent()}
          </div>
        ) : null}
      </DomeCollapsibleRow>
    </div>
  );
}

/** Grouped tool calls: compact header with count, expandable to show individual cards */
interface ChatToolCardGroupProps {
  name: string;
  calls: ToolCallData[];
  className?: string;
  surfaceVariant?: ChatToolSurfaceVariant;
}

interface SubagentToolSectionProps {
  agentKey: string;
  agentLabel: string;
  surfaceVariant?: ChatToolSurfaceVariant;
  className?: string;
  children: ReactNode;
}

/** Collapsible block grouping tools executed by one subagent delegation. */
export function SubagentToolSection({
  agentKey,
  agentLabel,
  surfaceVariant = 'default',
  className = '',
  children,
}: SubagentToolSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const childArray = useMemo(() => (Array.isArray(children) ? children : [children]).filter(Boolean), [children]);

  if (surfaceVariant === 'many') {
    return (
      <div className={`many-subagent-section ${className}`.trim()}>
        <button
          type="button"
          className="many-subagent-section-trigger"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
        >
          <Users size={14} strokeWidth={1.8} className="many-subagent-section-icon" aria-hidden />
          <span className="many-subagent-section-title">
            {t('chat.subagent_section_title', { agent: agentLabel, defaultValue: agentLabel })}
          </span>
          <DomeBadge label={agentKey} variant="soft" size="xs" color="var(--accent)" />
          <ChevronRight size={14} className={`many-tool-card-v2-chevron ml-auto ${expanded ? 'expanded' : ''}`} aria-hidden />
        </button>
        {expanded ? <div className="many-subagent-section-body space-y-1">{childArray}</div> : null}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        borderLeft: '2px solid var(--accent)',
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--accent) 5%, transparent)',
        padding: '4px 0 4px 0',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left rounded-r-md hover:bg-[var(--bg-hover)]"
        aria-expanded={expanded}
      >
        <Users className="size-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
        <span className="text-[12px] font-semibold text-[var(--secondary-text)]">
          {t('chat.subagent_section_title', { agent: agentLabel, defaultValue: agentLabel })}
        </span>
        <ChevronRight className={`size-3.5 ml-auto transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden />
      </button>
      {expanded ? <div className="pl-3 pr-1 pb-1 flex flex-col gap-1">{childArray}</div> : null}
    </div>
  );
}

export function ChatToolCardGroup({
  name,
  calls,
  className = '',
  surfaceVariant = 'default',
}: ChatToolCardGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const Icon = getIconForTool(name);
  const label = getToolDisplayLabelForCall({ name, arguments: calls[0]?.arguments ?? {} }, t);
  const category = getCategory(name);
  const accentColor = CATEGORY_COLORS[category];
  const count = calls.length;
  const hasError = calls.some((c) => c.status === 'error');
  const hasPending = calls.some((c) => c.status === 'pending' || c.status === 'running');
  const allSuccess = calls.every((c) => c.status === 'success');
  const stateKey = hasPending ? 'running' : hasError ? 'error' : allSuccess ? 'success' : 'pending';

  // ── Many panel: card-based group ──────────────────────────────────────────
  if (surfaceVariant === 'many') {
    return (
      <div className={`many-tool-card-v2 state-${stateKey} ${className}`.trim()}>
        <button
          type="button"
          className="many-tool-card-v2-trigger"
          onClick={() => setExpanded((o) => !o)}
          aria-expanded={expanded}
        >
          <div className={`many-tool-card-v2-icon state-${stateKey}`}>
            {hasPending
              ? <Loader2 size={12} className="many-tool-spinner animate-spin" />
              : <Icon size={14} strokeWidth={1.8} />}
          </div>
          <span className="many-tool-card-v2-copy">
            <span className="many-tool-card-v2-title">{t('chat.tool_group_count', { label, count })}</span>
          </span>
          <div className="many-tool-card-v2-trail">
            {allSuccess ? <Check size={12} strokeWidth={2.4} className="many-tool-card-v2-status-icon" aria-hidden /> : null}
            {hasError ? <XCircle size={12} className="many-tool-card-v2-status-icon is-error" aria-hidden /> : null}
            <ChevronRight size={14} className={`many-tool-card-v2-chevron ${expanded ? 'expanded' : ''}`} aria-hidden />
          </div>
        </button>
        {expanded ? (
          <div className="many-tool-card-v2-body is-nested">
            <div className="many-tool-card-v2-list">
              {calls.map((tc) => (
                <ChatToolCard key={tc.id} toolCall={tc} surfaceVariant={surfaceVariant} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ── Default surface: original left-border style ────────────────────────────
  return (
    <div
      className={className}
      style={{
        minWidth: 0,
        maxWidth: '100%',
        fontSize: 13,
        borderLeft: `2px solid ${accentColor}`,
        borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
        background: 'color-mix(in srgb, var(--bg-secondary) 86%, transparent)',
        transition: 'background 150ms ease',
      }}
    >
      <DomeCollapsibleRow
        expanded={expanded}
        onExpandedChange={setExpanded}
        triggerClassName="!px-2 !py-1.5 rounded-r-md"
        trigger={
          <>
            <div className="flex shrink-0 size-4 items-center justify-center">
              {hasPending ? (
                <Loader2 className="w-[13px] h-[13px] animate-spin" style={{ color: accentColor }} />
              ) : hasError ? (
                <XCircle className="w-[13px] h-[13px] text-[var(--error)]" />
              ) : allSuccess ? (
                <CheckCircle2 className="w-[13px] h-[13px] text-[var(--success)]" />
              ) : (
                <Icon className="w-[13px] h-[13px] text-[var(--tertiary-text)]" />
              )}
            </div>
            <span className="text-[13px] font-semibold text-[var(--secondary-text)] leading-snug">
              {t('chat.tool_group_count', { label, count })}
            </span>
          </>
        }
        panelClassName="!mt-0.5 !ml-2 !pl-3 border-l border-[var(--border)] flex flex-col gap-1"
      >
        {calls.map((tc) => (
          <ChatToolCard key={tc.id} toolCall={tc} surfaceVariant={surfaceVariant} />
        ))}
      </DomeCollapsibleRow>
    </div>
  );
}
