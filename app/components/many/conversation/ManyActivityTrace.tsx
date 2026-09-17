import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  BrainIcon,
  CancelCircleIcon,
  FileCodeIcon,
  Search01Icon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Spinner } from '@/components/ui/spinner';
import { SafeText } from '@/components/shared/SafeText';
import { parseTodos } from '@/lib/chat/todos';
import type { ToolLabelT } from '@/lib/chat/toolCatalog';
import {
  activitySegmentsFromBlocks,
  buildCodingTraceRows,
  buildSearchTraceRows,
  buildStepsTraceRows,
  isCallGroupWorking,
  isToolWorking,
  traceHeaderLabel,
  type ActivityDisplayBlock,
  type ActivityKind,
  type ActivitySegment,
  type ActivityToolCall,
  type ActivityTraceCopy,
  type ActivityTraceKind,
  type ActivityTraceRow,
  type ActivityToolStatus,
} from '@/lib/chat/manyActivityTrace';
import { cn } from '@/lib/utils';

export type ActivityLinkMode = 'ipc' | 'anchor';

const TRACE_DURATION = 'duration-[var(--duration-ui)] ease-[var(--ease-out)] motion-reduce:transition-none';

function kindIcon(kind: ActivityTraceKind) {
  switch (kind) {
    case 'search':
      return Search01Icon;
    case 'coding':
      return FileCodeIcon;
    case 'reasoning':
      return BrainIcon;
    case 'steps':
      return Wrench01Icon;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function getElectronInvoke(): ((channel: string, ...args: unknown[]) => Promise<unknown>) | undefined {
  const host = globalThis as {
    window?: { electron?: { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> } };
  };
  return host.window?.electron?.invoke;
}

function openActivityUrl(url: string, mode: ActivityLinkMode, event: MouseEvent<HTMLAnchorElement>) {
  if (mode === 'anchor') return;
  event.preventDefault();
  const invoke = getElectronInvoke();
  if (!invoke) return;
  invoke('open-external-url', url).catch(() => {});
}

function rowTone(status: ActivityToolStatus): string {
  if (status === 'error') return 'text-destructive';
  if (isToolWorking(status)) return 'text-foreground';
  return 'text-muted-foreground';
}

function TraceGuideDot({ status }: { status: ActivityToolStatus }) {
  if (isToolWorking(status)) {
    return (
      <span aria-hidden className="inline-flex shrink-0">
        <Spinner className="size-3" />
      </span>
    );
  }
  if (status === 'error') {
    return <HugeiconsIcon icon={CancelCircleIcon} className="size-3 shrink-0 text-destructive" />;
  }
  return <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-border" />;
}

export type ManyActivityTraceProps = {
  kind: ActivityTraceKind;
  working: boolean;
  copy: ActivityTraceCopy;
  count?: number;
  title?: string;
  rows?: ActivityTraceRow[];
  query?: string;
  moreCount?: number;
  reasoning?: string;
  selectedId?: string | null;
  onSelectRow?: (row: ActivityTraceRow) => void;
  renderDetail?: (row: ActivityTraceRow) => ReactNode;
  linkMode?: ActivityLinkMode;
  className?: string;
};

export default function ManyActivityTrace({
  kind,
  working,
  copy,
  count = 0,
  title,
  rows = [],
  query,
  moreCount = 0,
  reasoning,
  selectedId = null,
  onSelectRow,
  renderDetail,
  linkMode = 'ipc',
  className,
}: ManyActivityTraceProps) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? working;
  const header = title ?? traceHeaderLabel(kind, working, count, copy);
  const showList = rows.length > 0 || Boolean(query) || moreCount > 0;

  return (
    <Collapsible
      open={open}
      onOpenChange={setUserOpen}
      className={cn('w-full min-w-0 max-w-full', className)}
      data-kind={kind}
      data-working={working ? 'true' : 'false'}
    >
      <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted motion-reduce:transition-none">
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className={cn('size-3.5 shrink-0 transition-transform', TRACE_DURATION, open && 'rotate-90')}
        />
        <span aria-hidden className="inline-flex shrink-0">
          {working ? (
            <Spinner className="size-3.5" />
          ) : (
            <HugeiconsIcon icon={kindIcon(kind)} className="size-3.5" />
          )}
        </span>
        <SafeText className={cn('min-w-0 flex-1 text-xs font-medium', working && 'shimmer')}>
          {header}
        </SafeText>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        {reasoning ? (
          <div className="ml-1.5 border-l border-border py-1 pl-3.5">
            <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {reasoning}
            </div>
          </div>
        ) : null}
        {showList ? (
          <div className="relative ml-2.5">
            <span aria-hidden className="absolute bottom-1.5 left-0 top-1.5 w-px bg-border" />
            {query ? (
              <p className="mb-1 min-w-0 pl-4 text-xs text-muted-foreground">
                <SafeText>{query}</SafeText>
              </p>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {rows.map((row) => {
                const selected = row.id === selectedId;
                const detail = selected && renderDetail ? renderDetail(row) : null;
                const content = (
                  <>
                    <TraceGuideDot status={row.status} />
                    <SafeText className={cn('shrink-0 font-medium', rowTone(row.status))}>
                      {row.primary}
                    </SafeText>
                    {row.secondary ? (
                      <SafeText
                        className={cn(
                          'min-w-0 flex-1 text-[11.5px] text-muted-foreground',
                          row.mono && 'font-mono',
                        )}
                        title={row.secondary}
                      >
                        {row.secondary}
                      </SafeText>
                    ) : null}
                    {(row.add ?? 0) > 0 ? (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-success">
                        +{row.add}
                      </span>
                    ) : null}
                    {(row.del ?? 0) > 0 ? (
                      <span className="shrink-0 font-mono text-[11px] font-semibold text-destructive">
                        −{row.del}
                      </span>
                    ) : null}
                  </>
                );
                const rowClass = cn(
                  'flex min-w-0 items-baseline gap-1.5 rounded-md py-0.5 pl-4 pr-1.5 text-left text-xs',
                  selected && 'bg-muted',
                );
                return (
                  <li key={row.id} className="min-w-0">
                    {row.href ? (
                      <a
                        href={row.href}
                        target={linkMode === 'anchor' ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        className={cn(rowClass, 'text-foreground hover:bg-muted/70')}
                        onClick={(event) => openActivityUrl(row.href!, linkMode, event)}
                      >
                        {content}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={rowClass}
                        aria-pressed={selected}
                        onClick={() => onSelectRow?.(row)}
                      >
                        {content}
                      </button>
                    )}
                    {detail ? <div className="min-w-0 py-1 pl-4">{detail}</div> : null}
                  </li>
                );
              })}
            </ul>
            {moreCount > 0 ? (
              <p className="pl-4 pt-0.5 text-[11px] text-muted-foreground">{copy.moreResults(moreCount)}</p>
            ) : null}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ManyToolActivityTrace({
  kind,
  calls,
  copy,
  toolLabelT,
  renderDetail,
  linkMode = 'ipc',
  className,
}: {
  kind: ActivityKind;
  calls: ActivityToolCall[];
  copy: ActivityTraceCopy;
  toolLabelT: ToolLabelT;
  renderDetail?: (call: ActivityToolCall) => ReactNode;
  linkMode?: ActivityLinkMode;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const working = isCallGroupWorking(calls);
  const search = useMemo(
    () => (kind === 'search' ? buildSearchTraceRows(calls, copy.untitledResult) : null),
    [calls, copy.untitledResult, kind],
  );
  const rows = useMemo(() => {
    if (kind === 'search') return search?.rows ?? [];
    if (kind === 'coding') return buildCodingTraceRows(calls, copy.codingActions);
    return buildStepsTraceRows(calls, toolLabelT);
  }, [calls, copy.codingActions, kind, search, toolLabelT]);

  const selectedCall = calls.find((call) => call.id === selectedId) ?? null;

  return (
    <ManyActivityTrace
      kind={kind}
      working={working}
      copy={copy}
      count={calls.length}
      rows={rows}
      query={search?.query}
      moreCount={search?.moreCount ?? 0}
      selectedId={rows.find((row) => row.toolCallId === selectedId)?.id ?? selectedId}
      onSelectRow={(row) => {
        const next = row.toolCallId ?? row.id;
        setSelectedId((current) => (current === next ? null : next));
      }}
      renderDetail={
        selectedCall && renderDetail
          ? () => renderDetail(selectedCall)
          : undefined
      }
      linkMode={linkMode}
      className={className}
    />
  );
}

function activitySegmentKey(segment: ActivitySegment, index: number): string {
  if (segment.type === 'todos') return `todos:${segment.call.id}`;
  if (segment.type === 'subagent') return `subagent:${segment.agentKey}:${index}`;
  return `trace:${segment.kind}:${segment.calls[0]?.id ?? index}:${segment.calls.length}`;
}

function DefaultSubagentWrap({
  agentLabel,
  children,
}: {
  agentLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="px-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <SafeText>{agentLabel}</SafeText>
      </p>
      {children}
    </div>
  );
}

export function ManyActivityBlocks({
  blocks,
  segments: segmentsProp,
  copy,
  toolLabelT,
  renderToolDetail,
  renderTodos,
  renderSubagent,
  linkMode = 'ipc',
  className,
}: {
  blocks?: ActivityDisplayBlock[];
  segments?: ActivitySegment[];
  copy: ActivityTraceCopy;
  toolLabelT: ToolLabelT;
  renderToolDetail?: (call: ActivityToolCall) => ReactNode;
  renderTodos?: (call: ActivityToolCall) => ReactNode;
  renderSubagent?: (props: { agentKey: string; agentLabel: string; children: ReactNode }) => ReactNode;
  linkMode?: ActivityLinkMode;
  className?: string;
}) {
  const segments = segmentsProp ?? activitySegmentsFromBlocks(blocks ?? []);
  if (segments.length === 0) return null;
  return (
    <div className={cn('flex w-full min-w-0 flex-col gap-1.5', className)}>
      {segments.map((segment, index) => (
        <ActivitySegmentView
          key={activitySegmentKey(segment, index)}
          segment={segment}
          copy={copy}
          toolLabelT={toolLabelT}
          renderToolDetail={renderToolDetail}
          renderTodos={renderTodos}
          renderSubagent={renderSubagent}
          linkMode={linkMode}
        />
      ))}
    </div>
  );
}

function SimpleTodoList({ call }: { call: ActivityToolCall }) {
  const todos = parseTodos(call.arguments);
  if (todos.length === 0) return null;
  return (
    <ul className="flex min-w-0 flex-col gap-1 px-1.5">
      {todos.map((todo) => (
        <li key={todo.content} className="min-w-0 text-xs text-muted-foreground">
          <SafeText>{todo.content}</SafeText>
        </li>
      ))}
    </ul>
  );
}

function ActivitySegmentView({
  segment,
  copy,
  toolLabelT,
  renderToolDetail,
  renderTodos,
  renderSubagent,
  linkMode,
}: {
  segment: ActivitySegment;
  copy: ActivityTraceCopy;
  toolLabelT: ToolLabelT;
  renderToolDetail?: (call: ActivityToolCall) => ReactNode;
  renderTodos?: (call: ActivityToolCall) => ReactNode;
  renderSubagent?: (props: { agentKey: string; agentLabel: string; children: ReactNode }) => ReactNode;
  linkMode: ActivityLinkMode;
}) {
  if (segment.type === 'todos') {
    return renderTodos ? renderTodos(segment.call) : <SimpleTodoList call={segment.call} />;
  }
  if (segment.type === 'subagent') {
    const children = (
      <>
        {segment.segments.map((inner, index) => (
          <ActivitySegmentView
            key={activitySegmentKey(inner, index)}
            segment={inner}
            copy={copy}
            toolLabelT={toolLabelT}
            renderToolDetail={renderToolDetail}
            renderTodos={renderTodos}
            renderSubagent={renderSubagent}
            linkMode={linkMode}
          />
        ))}
      </>
    );
    if (renderSubagent) {
      return renderSubagent({ agentKey: segment.agentKey, agentLabel: segment.agentLabel, children });
    }
    return <DefaultSubagentWrap agentLabel={segment.agentLabel}>{children}</DefaultSubagentWrap>;
  }
  return (
    <ManyToolActivityTrace
      kind={segment.kind}
      calls={segment.calls}
      copy={copy}
      toolLabelT={toolLabelT}
      renderDetail={renderToolDetail}
      linkMode={linkMode}
    />
  );
}
