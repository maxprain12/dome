
import { useState, useMemo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckmarkCircle02Icon, File02Icon, InformationCircleIcon, PlusSignCircleIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard from './ArtifactCard';
import ChatTodoList from './ChatTodoList';
import { parseTodos } from '@/lib/chat/todos';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { parseContentImages, parseImageResult } from '@/lib/chat/image-tool-utils';
import { ChatToolMarker, ChatToolGroupMarker } from './ChatToolMarker';
import { getSubagentDisplayLabel } from '@/lib/chat/toolCatalog';
import { getToolDisplayLabelForCall } from '@/lib/chat/toolDisplayLabels';
import { JsonPrettyPrinterRoot } from '@/lib/chat/jsonPrettyPrinter';
import { isFilesystemTreeTool, parseTreeToolSummary } from '@/lib/chat/treeToolSummary';
import { stableStringHash } from '@/lib/utils/stableStringHash';
import { cn } from '@/lib/utils';
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
  /**
   * Characters of assistant text emitted before this call, used to interleave
   * the card at the point of the reply where it actually happened.
   * Absent on messages restored from storage, which fall back to tools-first.
   */
  contentOffset?: number;
}

export type ChatToolSurfaceVariant = 'default' | 'many';

interface ChatToolCardProps {
  toolCall: ToolCallData;
  className?: string;
  surfaceVariant?: ChatToolSurfaceVariant;
}

// Config, parsers y highlights extraídos (03/T02) — misma API pública.
import {
  getIconForTool,
} from './tool-card/toolCardConfig';
import {
  parseDocumentResult,
  parseArtifactResult,
  parsePersistedArtifactCreateResult,
  parseResourceItems,
  parsePeopleToolResult,
  parseToolDefinitionResult,
  isPeopleInspectTool,
  isToolDefinitionInspect,
  smartToolSummary,
  getCodegenPreview,
} from './tool-card/toolResultParsers';
import { formatToolArgValue, PeekDefinitionList } from '@/components/inspect/PeekDefinitionList';
import { humanizePersonStatus } from '@/components/people/personStatuses';
import { useInspectStore } from '@/lib/store/useInspectStore';
import {
  CodegenPreview,
} from './tool-card/ToolResultHighlights';
import {
  DiffPreview,
  ShellPreview,
  parseDiffResult,
  parseShellResult,
} from './tool-card/DiffPreview';
import { renderToolSuccessHighlight } from '@/lib/chat/toolResultHighlights';
import { renderTreeToolSummary } from '@/lib/chat/renderTreeToolSummary';
import SubagentTranscript from '@/components/many/conversation/SubagentTranscript';

import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
function formatToolResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result === null || result === undefined) return '';
  try { return JSON.stringify(result, null, 2); } catch { return String(result); }
}

function dispatchSoftConfirm(approved: boolean) {
  const text = approved ? 'Sí, confirmo.' : 'No, cancela.';
  window.dispatchEvent(new CustomEvent('dome:quick-reply', { detail: { text } }));
}

export default function ChatToolCard({ toolCall, className = '' }: ChatToolCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const Icon = getIconForTool(toolCall.name);
  const label = getToolDisplayLabelForCall(toolCall, t);

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
  const persistedArtifact = useMemo(() => {
    if (toolCall.name !== 'artifact_create') return null;
    return parsePersistedArtifactCreateResult(toolCall.result);
  }, [toolCall.name, toolCall.result]);
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

  // Soft confirmation requested by tool (needs_confirmation status)
  const needsConfirmation = (parsedResult as Record<string, unknown> | null)?.status === 'needs_confirmation';

  // Each renderer handles a single concern and returns null when not applicable;
  // the orchestrator below walks them in priority order.
  const renderSoftConfirmation = (): ReactNode => {
    if (!needsConfirmation || toolCall.status !== 'success') return null;
    const msg = (parsedResult as Record<string, unknown>)?.error;
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <AlertDescription className="text-sm">
          {typeof msg === 'string' ? msg : 'Esta acción requiere confirmación.'}
        </AlertDescription>
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => dispatchSoftConfirm(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => dispatchSoftConfirm(true)}
          >
            Confirmar
          </Button>
        </div>
      </Alert>
    );
  };

  const renderErrorBlock = (): ReactNode => {
    if (!toolCall.error) return null;
    return <Alert variant="destructive"><AlertDescription>{toolCall.error}</AlertDescription></Alert>;
  };

  const renderFormattedView = (): ReactNode => {
    if (showRawJson) return null;
    if (treeToolSummary) return renderTreeToolSummary(treeToolSummary, t);

    // Coding surfaces: show the actual change, not a JSON blob.
    const diff = parseDiffResult(toolCall.result);
    if (diff) return <div className="mt-1"><DiffPreview diff={diff} t={t} /></div>;
    const shell = parseShellResult(toolCall.result);
    if (shell) return <div className="mt-1"><ShellPreview shell={shell} t={t} /></div>;

    const codegen = getCodegenPreview(toolCall.name, toolCall.arguments);
    if (codegen) return <CodegenPreview preview={codegen} t={t} />;
    if (isPeopleInspectTool(toolCall.name)) {
      const peopleView = parsePeopleToolResult(toolCall.result);
      if (peopleView) {
        return (
          <div className="mt-1 flex flex-col gap-2">
            {peopleView.rows.map((row, index) => (
              <PeekDefinitionList
                key={`${row.displayName}:${index}`}
                items={[
                  { key: t('people.display_name_label'), value: row.displayName },
                  ...(row.email ? [{ key: t('inspect.email'), value: row.email }] : []),
                  ...(row.leadStatus
                    ? [{
                        key: t('inspect.lead_status'),
                        value: t(`people.lead_status_${row.leadStatus}`, {
                          defaultValue: humanizePersonStatus(row.leadStatus),
                        }),
                      }]
                    : []),
                  ...row.identities.map((identity) => ({
                    key: identity.source.replace(/_/g, ' ') || t('inspect.identities'),
                    value: identity.label,
                  })),
                ]}
              />
            ))}
          </div>
        );
      }
    }
    if (isToolDefinitionInspect(toolCall.name)) {
      const definition = parseToolDefinitionResult(toolCall.result);
      if (definition) {
        return (
          <div className="mt-1 flex flex-col gap-1">
            <p className="text-xs font-medium">{definition.name}</p>
            {definition.description ? (
              <p className="text-xs text-muted-foreground">{definition.description}</p>
            ) : null}
          </div>
        );
      }
    }
    const highlight = renderToolSuccessHighlight(toolCall.name, toolCall.result, t);
    if (highlight) return <div className="mt-1">{highlight}</div>;
    return null;
  };

  const renderRawJson = (): ReactNode => {
    if (!showRawJson) return null;
    return (
      <pre className="chat-tool-result-pre">
        {resultText}
      </pre>
    );
  };

  const renderDocuments = (): ReactNode => {
    if (!documentItems || documentItems.length === 0) return null;
    const counts = new Map<string, number>();
    return (
      <div className="flex flex-col gap-3">
        {documentItems.map((item) => {
          const h = stableStringHash(JSON.stringify(item));
          const ord = (counts.get(h) ?? 0) + 1;
          counts.set(h, ord);
          return (
            <div key={`doc:${h}:${ord}`} className="flex flex-col gap-1">
              {item.metadata?.title != null && (
                <p className="text-xs font-semibold text-foreground">
                  {String(item.metadata.title)}
                </p>
              )}
              {item.content && (
                <div className="text-xs text-muted-foreground">
                  <MarkdownRenderer content={typeof item.content === 'string' ? item.content : ''} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderPersistedArtifact = (): ReactNode => {
    if (!persistedArtifact) return null;
    return (
      <Card className="mt-1.5 gap-2 py-3">
        <CardHeader className="px-3">
          <CardTitle className="text-sm">
            {persistedArtifact.title}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {persistedArtifact.artifactType}
          </p>
        </CardHeader>
        <CardContent className="px-3">
        <Button onClick={() =>
            useTabStore.getState().openResourceTab(
              persistedArtifact.resourceId,
              'artifact',
              persistedArtifact.title,
            )
          }
  size="xs">
          {t('artifacts.open_artifact', { defaultValue: 'Abrir artifact' })}
        </Button>
        </CardContent>
      </Card>
    );
  };

  const renderArtifactCardItem = (): ReactNode => {
    if (!artifactItems) return null;
    return (
      <div className="mt-1.5">
        <ArtifactCard artifact={artifactItems} />
      </div>
    );
  };

  const renderContentImageItems = (): ReactNode => {
    if (!contentImages || contentImages.length === 0) return null;
    const imgCounts = new Map<string, number>();
    return (
      <div className="mt-1.5 flex flex-col gap-3">
        {contentImages.map((item) => {
          const h = stableStringHash(item.dataUrl);
          const ord = (imgCounts.get(h) ?? 0) + 1;
          imgCounts.set(h, ord);
          const figureN = ord;
          return (
            <figure key={`fig:${h}:${ord}`} className="flex flex-col gap-1">
              {item.label && (
                <figcaption className="text-xs text-muted-foreground">{item.label}</figcaption>
              )}
              <img
                src={item.dataUrl}
                alt={item.label || `Figure ${figureN}`}
                className="max-h-52 max-w-72 rounded-lg border object-contain"
              />
            </figure>
          );
        })}
      </div>
    );
  };

  const renderImageResult = (): ReactNode => {
    if (!imageItems) return null;
    return (
      <div className="mt-1.5 flex items-start gap-3">
        <img
          src={imageItems.dataUrl}
          alt={imageItems.alt || t('chat.tool_image_processed')}
          className="max-h-52 max-w-52 rounded-lg border object-contain"
        />
        <div className="text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">{t('chat.tool_image_processed')}</p>
          <p className="opacity-70">{t('chat.tool_image_expand')}</p>
        </div>
      </div>
    );
  };

  const renderResourceList = (): ReactNode => {
    if (!resourceItems || resourceItems.length === 0) return null;
    return (
      <div className="flex flex-col gap-1">
        {resourceItems.map((item) => {
          const isPinned = pinnedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={cn('flex items-start gap-1.5 rounded-lg border px-2 py-1.5', isPinned ? 'bg-primary/5' : 'bg-muted')}
            >
              <HugeiconsIcon icon={File02Icon} className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {item.title}
                </span>
                {item.snippet && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.snippet}
                  </span>
                )}
              </div>
              {item.similarity != null && (
                <Badge variant="secondary" className="mt-0.5 h-auto max-w-full shrink-0 gap-1 px-1.5 py-0.5 text-[10px] font-semibold"><span className="truncate">{`${Math.round(item.similarity * 100)}%`}</span></Badge>
              )}
              <Button type="button"
  variant="ghost"
  onClick={() => {
                  if (isPinned) {
                    removePinnedResource(item.id);
                  } else {
                    addPinnedResource({ id: item.id, title: item.title, type: item.type });
                  }
                }}
  title={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
  aria-label={isPinned ? t('chat.remove_from_context') : t('chat.add_to_context')}
  className="!p-0 size-5 min-w-0 shrink-0 text-muted-foreground hover:text-primary"
  size="icon-xs">
                {isPinned ? (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
                ) : (
                  <HugeiconsIcon icon={PlusSignCircleIcon} className="size-3.5" />
                )}
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderJsonPrettyView = (): ReactNode => {
    if (!parsedResult || typeof parsedResult !== 'object') return null;
    return (
      <div className="max-h-64 overflow-x-auto overflow-y-auto break-words rounded-lg bg-muted px-2.5 py-2 font-mono text-xs">
        <JsonPrettyPrinterRoot value={parsedResult} />
      </div>
    );
  };

  const renderFallback = (): ReactNode => (
    <pre className="chat-tool-result-pre">
      {resultText}
    </pre>
  );

  const renderResultContent = (): ReactNode => {
    const renderers: ReadonlyArray<() => ReactNode> = [
      renderSoftConfirmation,
      renderErrorBlock,
      renderFormattedView,
      renderRawJson,
      renderDocuments,
      renderPersistedArtifact,
      renderArtifactCardItem,
      renderContentImageItems,
      renderImageResult,
      renderResourceList,
      renderJsonPrettyView,
    ];
    for (const renderer of renderers) {
      const node = renderer();
      if (node) return node;
    }
    return renderFallback();
  };

  const hasResult = Boolean(toolCall.result || toolCall.error);
  const canExpand = !isPending && hasResult;
  const cardSummary = smartToolSummary(toolCall.name, toolCall.arguments);

  const toolLabel = (
    <>
      {label}
      {showSubagentBadge ? (
        <Badge
          variant="secondary"
          className="ml-1.5 inline-flex h-auto max-w-full gap-1 border-transparent bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-primary"
        >
          <span className="truncate">{subagentName}</span>
        </Badge>
      ) : null}
    </>
  );

  const expandedBody = expanded && canExpand ? (
    <div className="not-typeset ml-1 border-l border-border py-1 pl-3">
      {Object.keys(toolCall.arguments).length > 0 ? (
        <>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('inspect.tool_args')}
          </div>
          <PeekDefinitionList
            className="mb-2.5"
            items={Object.entries(toolCall.arguments).slice(0, 4).map(([k, v]) => ({
              key: k,
              value: formatToolArgValue(v),
            }))}
          />
        </>
      ) : null}
      {!toolCall.error && hasResult ? (
        <div className="mb-1.5">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowRawJson(!showRawJson)}
            className="h-auto px-0 py-0 font-mono text-[11px] underline text-muted-foreground opacity-70 hover:opacity-100"
            size="xs"
          >
            {showRawJson ? t('chat.formatted_view') : t('chat.view_json')}
          </Button>
        </div>
      ) : null}
      {renderResultContent()}
    </div>
  ) : null;

  return (
    <div className={cn('flex min-w-0 max-w-full flex-col gap-1', className)}>
      <ChatToolMarker
        label={toolLabel}
        summary={cardSummary}
        status={toolCall.status}
        icon={Icon}
        expanded={expanded}
        expandable={canExpand}
        onToggle={canExpand ? () => setExpanded((open) => !open) : undefined}
        trailing={
          !isPending ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground"
              aria-label={t('inspect.inspect_tool')}
              onClick={() => {
                useInspectStore.getState().open({ kind: 'tool', toolCall });
              }}
            >
              <HugeiconsIcon icon={InformationCircleIcon} />
            </Button>
          ) : null
        }
      />
      {expandedBody}
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
  className = '',
  children,
}: SubagentToolSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const childArray = useMemo(() => (Array.isArray(children) ? children : [children]).filter(Boolean), [children]);

  const sectionLabel = (
    <>
      {t('chat.subagent_section_title', { agent: agentLabel, defaultValue: agentLabel })}
      <Badge
        variant="secondary"
        className="ml-1.5 inline-flex h-auto max-w-full gap-1 border-transparent bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-primary"
      >
        <span className="truncate">{agentKey}</span>
      </Badge>
    </>
  );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ChatToolMarker
        label={sectionLabel}
        status="success"
        icon={UserMultiple02Icon}
        expanded={expanded}
        expandable
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? (
        <div className="flex flex-col gap-1 pl-1">
          {childArray}
          {/* The tools above are only what the subagent surfaced to the parent
              stream; its full transcript lives in its own nested session. */}
          <SubagentTranscript agentKey={agentKey} className="pt-0.5" />
        </div>
      ) : null}
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
  const count = calls.length;
  const hasError = calls.some((c) => c.status === 'error');
  const hasPending = calls.some((c) => c.status === 'pending' || c.status === 'running');
  const allSuccess = calls.every((c) => c.status === 'success');
  const groupStatus: ToolCallData['status'] = hasPending
    ? 'running'
    : hasError
      ? 'error'
      : allSuccess
        ? 'success'
        : 'pending';

  // While the group is working, surface what it is working *on*; once it is
  // done, the last target is the most useful trace of where it ended up.
  const activeCall =
    calls.find((c) => c.status === 'running' || c.status === 'pending')
    ?? calls[calls.length - 1];
  const groupSummary = activeCall ? smartToolSummary(activeCall.name, activeCall.arguments ?? {}) : '';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ChatToolGroupMarker
        label={t('chat.tool_group_count', { label, count })}
        summary={groupSummary || undefined}
        status={groupStatus}
        icon={Icon}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
      />
      {expanded ? (
        <div className="flex flex-col gap-1 pl-1">
          {calls.map((tc) => (
            <ChatToolCard key={tc.id} toolCall={tc} surfaceVariant={surfaceVariant} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
