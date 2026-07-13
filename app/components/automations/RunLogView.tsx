import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { getToolDisplayLabel } from '@/lib/chat/toolDisplayLabels';
import {
  Cancel01Icon as XIcon,
  CheckmarkCircle02Icon as CheckCircle2Icon,
  CancelCircleIcon as XCircleIcon,
  Loading03Icon as Loader2Icon,
  Clock01Icon as ClockIcon,
  GlobeIcon as GlobeIcon,
  Search01Icon as SearchIcon,
  File02Icon as FileTextGlyph,
  DatabaseIcon as DatabaseIcon,
  Plug01Icon as PlugIcon,
  File02Icon as FileTextIconIcon,
  ShoppingBag01Icon as ShoppingBagIcon,
  GitBranchIcon as GitBranchIcon,
  BotIcon as BotIcon,
  ZapIcon as ZapIcon,
  HierarchySquare01Icon as NetworkIcon,
  GraduationCapIcon as GraduationCapIcon,
  CropIcon as CropIcon,
  Layers01Icon as LayersIcon,
  Calendar03Icon as CalendarIcon,
  AlertCircleIcon as AlertCircleIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import SubpageHeader from '@/components/shared/SubpageHeader';
import SubpageFooter from '@/components/shared/SubpageFooter';
import ListState from '@/components/shared/ListState';
import CollapsibleRow from '@/components/shared/CollapsibleRow';
import type { PersistentRun, PersistentRunStep } from '@/lib/automations/api';
import { getRunProgress } from '@/lib/automations/run-progress';
import { formatRunDate, formatDuration } from '@/lib/automations/run-log-format';
import { RunProgressBar } from '@/lib/automations/run-log-ui';
import { JsonPrettyPrinterRoot as JsonPrettyPrinter } from '@/lib/chat/jsonPrettyPrinter';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import RunStatusBadge from '@/components/automations/RunStatusBadge';

const Clock = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ClockIcon} {...props} />
);
const Globe = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={GlobeIcon} {...props} />
);
const Search = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={SearchIcon} {...props} />
);
const FileText = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={FileTextGlyph} {...props} />
);
const Database = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={DatabaseIcon} {...props} />
);
const Plug = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={PlugIcon} {...props} />
);
const FileTextIcon = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={FileTextIconIcon} {...props} />
);
const ShoppingBag = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ShoppingBagIcon} {...props} />
);
const GitBranch = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={GitBranchIcon} {...props} />
);
const Bot = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={BotIcon} {...props} />
);
const Zap = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={ZapIcon} {...props} />
);
const Network = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={NetworkIcon} {...props} />
);
const GraduationCap = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={GraduationCapIcon} {...props} />
);
const Crop = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={CropIcon} {...props} />
);
const Layers = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={LayersIcon} {...props} />
);
const Calendar = (props: Omit<React.ComponentProps<typeof HugeiconsIcon>, 'icon'>) => (
  <HugeiconsIcon icon={CalendarIcon} {...props} />
);
// ─── Shared helpers (aligned with ChatToolCard icons + toolDisplayLabels) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_ICONS: Record<string, any> = {
  web_search: Search,
  web_fetch: Globe,
  resource_create: FileText,
  resource_get: FileText,
  resource_search: Search,
  resource_hybrid_search: Search,
  call_research_agent: Search,
  call_library_agent: FileText,
  call_writer_agent: FileText,
  call_data_agent: Database,
  start_async_subagent_task: GitBranch,
  check_async_subagent_task: GitBranch,
  update_async_subagent_task: GitBranch,
  cancel_async_subagent_task: GitBranch,
  list_async_subagent_tasks: GitBranch,
  pdf_extract_text: FileTextIcon,
  pdf_get_metadata: FileTextIcon,
  pdf_summarize: FileTextIcon,
  pdf_extract_tables: FileTextIcon,
  image_crop: Crop,
  image_thumbnail: Layers,
  marketplace_search: ShoppingBag,
  marketplace_install: ShoppingBag,
  workflow_create: GitBranch,
  agent_create: Bot,
  automation_create: Zap,
  browser_get_active_tab: Globe,
  generate_mindmap: Network,
  generate_quiz: GraduationCap,
  generate_knowledge_graph: Network,
  calendar_list_events: Calendar,
  calendar_get_upcoming: Calendar,
  calendar_create_event: Calendar,
  calendar_update_event: Calendar,
  calendar_delete_event: Calendar,
  flashcard_create: Layers,
};

function getIconForTool(name: string) {
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  const n = (name || '').toLowerCase();
  if (n.includes('postgres') || n.includes('sql') || n.includes('database')) return Database;
  if (n.startsWith('mcp')) return Plug;
  return Globe;
}

function formatArgsSummary(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args || {})) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  const joined = parts.join(', ');
  return joined.length > 70 ? joined.slice(0, 70) + '…' : joined;
}

function parseJson(raw: unknown): unknown {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

// ─── RunStepCard ─────────────────────────────────────────────────────────────

function RunStepCard({ step }: { step: PersistentRunStep }) {
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
  const label = isToolCall ? getToolDisplayLabel(toolName, t) : step.title;

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
    ? <HugeiconsIcon icon={XCircleIcon} size={13} style={{ color: 'var(--destructive)', flexShrink: 0 }} />
    : isCancelled
      ? <HugeiconsIcon icon={XCircleIcon} size={13} className="opacity-60" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      : isWaitingApproval
        ? <HugeiconsIcon icon={ClockIcon} size={13} className="opacity-80" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
    : step.status === 'running'
      ? <HugeiconsIcon icon={Loader2Icon} size={13} className="animate-spin opacity-80" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
      : step.status === 'completed' || step.status === 'done'
        ? <HugeiconsIcon icon={CheckCircle2Icon} size={13} className="opacity-70" style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
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
              ? 'color-mix(in srgb, var(--destructive) 8%, transparent)'
              : isCancelled
                ? 'color-mix(in srgb, var(--accent) 80%, transparent)'
                : 'var(--muted)',
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
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {raw}
          </pre>
        );
      }

      if (parsedContent !== null && typeof parsedContent === 'object') {
        return (
          <div className="mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-72 bg-muted">
            <JsonPrettyPrinter value={parsedContent} />
          </div>
        );
      }

      if (typeof step.content === 'string') {
        return (
          <div className="mt-2 rounded-lg p-3 text-[11px] font-mono overflow-auto max-h-64"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {step.content}
          </div>
        );
      }
    }

    return null;
  };

  const hasContent = Boolean(step.content);

  const panelBody = hasContent ? (
    <div className="px-3 pb-3 bg-background">
      {isToolCall ? (
        <div className="flex justify-end pb-2">
          <Button type="button"
  variant="outline"
  onClick={() => setShowRaw(!showRaw)}
  size="xs">
            {showRaw ? t('runLog.view_pretty') : t('runLog.view_raw')}
          </Button>
        </div>
      ) : null}
      {renderContent()}
    </div>
  ) : undefined;

  return (
    <div
      className="rounded-md border border-border overflow-hidden bg-card"
    >
      <CollapsibleRow
        expanded={expanded}
        onExpandedChange={setExpanded}
        triggerClassName="px-3 py-2 bg-card hover:bg-accent"
        trigger={
          <>
            <Icon size={13} className="shrink-0 opacity-60 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-col gap-0.5 min-w-0 sm:flex-row sm:items-baseline sm:gap-2">
                <span className="text-[11px] shrink-0 tabular-nums text-muted-foreground">
                  {toolName || step.stepType}
                </span>
                <span className="text-sm font-normal leading-snug break-words text-foreground">{label}</span>
              </div>
              {argsSummary ? (
                <p className="text-[11px] mt-0.5 line-clamp-2 text-muted-foreground">{argsSummary}</p>
              ) : null}
            </div>
            <div className="flex items-center shrink-0">{statusIcon}</div>
          </>
        }
      >
        {panelBody}
      </CollapsibleRow>
    </div>
  );
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
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
        <span className="font-medium text-primary">
          {progress.percent ?? 0}% · {progress.completed}/{progress.total}
        </span>
      ) : null}
    </div>
  );

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="bottom-0 top-[var(--app-header-total)] h-auto w-[min(720px,92vw)] max-w-none sm:max-w-none"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">{run.title || run.id}</SheetTitle>
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
            <SubpageHeader className="bg-card">
              <SubpageHeader.Title>{run.title || run.id}</SubpageHeader.Title>
              <SubpageHeader.Subtitle>{subtitle}</SubpageHeader.Subtitle>
              <SubpageHeader.Trailing>
                <>
                  <RunStatusBadge status={run.status} />
                  <Button type="button"
  variant="ghost"
  onClick={onClose}
  aria-label={t('runLog.close_panel')}
  size="icon-sm">
                    <HugeiconsIcon icon={XIcon} className="size-[18px]" aria-hidden />
                  </Button>
                </>
              </SubpageHeader.Trailing>
            </SubpageHeader>
            {isRunning ? (
              <div className="shrink-0 px-5 py-2 border-b border-border bg-background">
                <RunProgressBar run={run} />
              </div>
            ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-5 py-4">
            {run.error ? (
              <Alert variant="destructive" role="note"><HugeiconsIcon icon={AlertCircleIcon} aria-hidden /><AlertTitle className="text-xs">{t('runLog.error_title')}</AlertTitle><AlertDescription className="text-xs">
                <p className="font-mono text-[11px] whitespace-pre-wrap break-all">{run.error}</p>
              </AlertDescription></Alert>
            ) : null}

            {run.outputText ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('runLog.response')}
                </p>
                <div className="rounded-xl border border-border bg-card p-4 text-sm">
                  <MarkdownRenderer content={run.outputText} />
                </div>
              </div>
            ) : null}

            {toolSteps.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('runLog.tools_used', { count: toolSteps.length })}
                </p>
                <div className="flex flex-col gap-2">
                  {toolSteps.map((step) => (
                    <RunStepCard key={step.id} step={step} />
                  ))}
                </div>
              </div>
            ) : null}

            {otherSteps.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('runLog.agent_steps', { count: otherSteps.length })}
                </p>
                <div className="flex flex-col gap-2">
                  {otherSteps.map((step) => (
                    <RunStepCard key={step.id} step={step} />
                  ))}
                </div>
              </div>
            ) : null}

            {steps.length === 0 && !run.outputText && !run.error ? (
              isRunning ? (
                <ListState variant="loading" loadingLabel={t('runLog.executing')} fullHeight />
              ) : (
                <ListState variant="empty" title={t('runLog.no_steps')} fullHeight />
              )
            ) : null}

            {run.summary ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {t('runLog.summary')}
                </p>
                <p className="text-sm text-muted-foreground">{run.summary}</p>
              </div>
            ) : null}
          </div>
          </div>
            <SubpageFooter className="bg-card">
              <SubpageFooter.Leading>
                <span className="text-[11px] text-muted-foreground">ID: {run.id}</span>
              </SubpageFooter.Leading>
              <SubpageFooter.Trailing>
                <Button type="button"
  variant="secondary"
  onClick={onClose}
  size="sm">
                  {t('runLog.close')}
                </Button>
              </SubpageFooter.Trailing>
            </SubpageFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}
