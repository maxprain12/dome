/**
 * ArtifactCard - Base component for rich content artifacts in chat
 *
 * Supports different artifact types: pdf_summary, table, action_items, chart, code, list
 */

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  File02Icon,
  TableIcon,
  CheckmarkSquare02Icon,
  ChartColumnIcon,
  CodeIcon,
  LeftToRightListBulletIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  BotIcon,
  ZapIcon,
  PlayIcon,
  BubbleChatIcon,
  ArrowUpRight01Icon,
  CalculatorIcon,
  HierarchySquare01Icon,
  LayoutGridIcon,
  GraduationCapIcon,
  Layout01Icon,
  FileCodeIcon,
  FileDownIcon,
  HistoryIcon,
  PanelRightIcon,
  Download04Icon,
  Calendar03Icon,
  Layers01Icon,
} from '@hugeicons/core-free-icons';
import { useTabStore } from '@/lib/store/useTabStore';
import type {
  CalculatorArtifactV,
  DiagramArtifactV,
  TabsArtifactV,
  PlaygroundArtifactV,
  DashboardArtifactV,
  TimelineArtifactV,
  HtmlArtifactV,
  CalendarEventArtifactV,
  FlashcardDeckArtifactV,
} from '@/lib/chat/artifactSchemas';
import CalculatorArtifact from '@/components/chat/artifacts/CalculatorArtifact';
import DiagramArtifact from '@/components/chat/artifacts/DiagramArtifact';
import TabsArtifact from '@/components/chat/artifacts/TabsArtifact';
import PlaygroundArtifact from '@/components/chat/artifacts/PlaygroundArtifact';
import DashboardArtifact from '@/components/chat/artifacts/DashboardArtifact';
import TimelineArtifact from '@/components/chat/artifacts/TimelineArtifact';
import HtmlArtifactFrame from '@/components/chat/artifacts/HtmlArtifactFrame';
import {
  CalendarEventArtifact,
  FlashcardDeckArtifact,
} from '@/components/chat/artifacts/CalendarFlashcardArtifacts';
import {
  buildDomeThemeStyleContent,
  useDomeThemeSnapshot,
} from '@/lib/chat/useDomeThemeSnapshot';

/** Whitelist of accepted chart dataset colors — must reference Dome tokens. */
const DOME_CHART_COLORS = new Set([
  'var(--primary)',
  'var(--success)',
  'var(--warning)',
  'var(--destructive)',
  'var(--info)',
  'var(--muted-foreground)',
  'var(--foreground)',
]);

function sanitizeChartColor(raw: string | undefined): string {
  if (!raw) return 'var(--primary)';
  const value = raw.trim().toLowerCase().replace(/\s+/g, '');
  const canonical = value.replace(/^var\(\s*/, 'var(').replace(/\s*\)$/, ')');
  return DOME_CHART_COLORS.has(canonical) ? canonical : 'var(--primary)';
}

export type ArtifactType =
  | 'pdf_summary'
  | 'table'
  | 'action_items'
  | 'chart'
  | 'code'
  | 'list'
  | 'created_entity'
  | 'docling_images'
  | 'calculator'
  | 'diagram'
  | 'tabs'
  | 'playground'
  | 'dashboard'
  | 'timeline'
  | 'html'
  | 'calendar_event'
  | 'flashcard_deck';

export interface BaseArtifact {
  type: ArtifactType;
  title?: string;
}

export interface PDFSummaryArtifact extends BaseArtifact {
  type: 'pdf_summary';
  resource_id: string;
  title: string;
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    pageCount?: number;
    creator?: string;
    producer?: string;
    page?: number;
  };
  total_pages: number;
  extracted_pages?: number;
  chars_extracted: number;
}

export interface TableArtifact extends BaseArtifact {
  type: 'table';
  resource_id?: string;
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ActionItemsArtifact extends BaseArtifact {
  type: 'action_items';
  items: Array<{
    id: string;
    text: string;
    completed?: boolean;
    assignee?: string;
    due_date?: string;
  }>;
}

export interface ChartArtifact extends BaseArtifact {
  type: 'chart';
  chart_type: 'bar' | 'line' | 'pie' | 'scatter';
  title: string;
  data: {
    labels: string[];
    datasets: Array<{
      label: string;
      data: number[];
      color?: string;
    }>;
  };
}

export interface CodeArtifact extends BaseArtifact {
  type: 'code';
  language: string;
  code: string;
}

export interface ListArtifact extends BaseArtifact {
  type: 'list';
  items: string[];
  ordered?: boolean;
}

export interface CreatedEntityArtifact extends BaseArtifact {
  type: 'created_entity';
  entityType: 'agent' | 'automation';
  id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface DoclingImagesArtifact extends BaseArtifact {
  type: 'docling_images';
  resource_id: string;
  resource_title?: string;
  images: Array<{
    image_id: string;
    caption?: string;
    page_no?: number;
  }>;
}

export type AnyArtifact =
  | PDFSummaryArtifact
  | TableArtifact
  | ActionItemsArtifact
  | ChartArtifact
  | CodeArtifact
  | ListArtifact
  | CreatedEntityArtifact
  | DoclingImagesArtifact
  | CalculatorArtifactV
  | DiagramArtifactV
  | TabsArtifactV
  | PlaygroundArtifactV
  | DashboardArtifactV
  | TimelineArtifactV
  | HtmlArtifactV
  | CalendarEventArtifactV
  | FlashcardDeckArtifactV;

interface ArtifactCardProps {
  artifact: AnyArtifact;
  onOpenResource?: (resourceId: string, type: string) => void;
  className?: string;
}

type ArtifactAccent = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

/** Semantic accent per artifact type, mapped to Tailwind-friendly classes below. */
const ARTIFACT_ACCENT: Record<ArtifactType, ArtifactAccent> = {
  pdf_summary: 'primary',
  table: 'success',
  action_items: 'warning',
  chart: 'primary',
  code: 'muted',
  list: 'destructive',
  created_entity: 'primary',
  docling_images: 'muted',
  calculator: 'primary',
  diagram: 'success',
  tabs: 'muted',
  playground: 'warning',
  dashboard: 'primary',
  timeline: 'muted',
  html: 'primary',
  calendar_event: 'primary',
  flashcard_deck: 'success',
};

/** `success` and `warning` have no Tailwind theme token, so they fall back to arbitrary `var()` values. */
const ACCENT_CLASSES: Record<ArtifactAccent, { border: string; icon: string; iconBg: string }> = {
  primary: { border: 'border-l-primary', icon: 'text-primary', iconBg: 'bg-primary/15' },
  success: { border: 'border-l-[var(--success)]', icon: 'text-[var(--success)]', iconBg: 'bg-[var(--success)]/15' },
  warning: { border: 'border-l-[var(--warning)]', icon: 'text-[var(--warning)]', iconBg: 'bg-[var(--warning)]/15' },
  destructive: { border: 'border-l-destructive', icon: 'text-destructive', iconBg: 'bg-destructive/15' },
  muted: { border: 'border-l-muted-foreground', icon: 'text-muted-foreground', iconBg: 'bg-muted-foreground/15' },
};

function getAccentClasses(type: ArtifactType) {
  return ACCENT_CLASSES[ARTIFACT_ACCENT[type] ?? 'muted'];
}

// Icon mapping
const ARTIFACT_ICONS: Record<ArtifactType, IconSvgElement> = {
  pdf_summary: File02Icon,
  table: TableIcon,
  action_items: CheckmarkSquare02Icon,
  chart: ChartColumnIcon,
  code: CodeIcon,
  list: LeftToRightListBulletIcon,
  created_entity: BotIcon,
  docling_images: File02Icon,
  calculator: CalculatorIcon,
  diagram: HierarchySquare01Icon,
  tabs: Layout01Icon,
  playground: GraduationCapIcon,
  dashboard: LayoutGridIcon,
  timeline: HistoryIcon,
  html: FileCodeIcon,
  calendar_event: Calendar03Icon,
  flashcard_deck: Layers01Icon,
};

function ArtifactHeader({
  artifact,
  expanded,
  onToggle,
  onCopy,
  copied,
}: {
  artifact: AnyArtifact;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
}) {
  const { t } = useTranslation();
  const accent = getAccentClasses(artifact.type);
  const headerIcon = ARTIFACT_ICONS[artifact.type] ?? File02Icon;

  const handleOpenTab = () => {
    const title = artifact.title || getArtifactTitle(artifact);
    useTabStore.getState().openArtifactTab(title, JSON.stringify(artifact));
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dome-artifact.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleExportHtml = () => {
    if (artifact.type !== 'html') return;
    const a = artifact as HtmlArtifactV;
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${a.title || 'artifact'}</title><style>${a.css || ''}</style></head><body>${a.html || ''}<script>${a.js || ''}</script></body></html>`;
    const blob = new Blob([doc], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'dome-artifact.html';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-auto min-w-0 flex-1 justify-start gap-2 p-1 font-normal"
      >
        <div className={cn('flex size-[26px] shrink-0 items-center justify-center rounded-md', accent.iconBg)}>
          <HugeiconsIcon icon={headerIcon} className={cn('size-3.5', accent.icon)} />
        </div>
        <span className="truncate text-left text-[13px] font-semibold text-foreground">
          {artifact.title || getArtifactTitle(artifact)}
        </span>
        <HugeiconsIcon
          icon={expanded ? ChevronUpIcon : ChevronDownIcon}
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Button>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleOpenTab}
          title={t('chat.open_in_tab')}
          aria-label={t('chat.open_in_tab')}
          className="size-8 text-muted-foreground hover:bg-accent"
        >
          <HugeiconsIcon icon={PanelRightIcon} className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={handleExportJson}
          title={t('chat.export_json')}
          aria-label={t('chat.export_json')}
          className="size-8 text-muted-foreground hover:bg-accent"
        >
          <HugeiconsIcon icon={Download04Icon} className="size-3.5" aria-hidden />
        </Button>
        {artifact.type === 'html' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleExportHtml}
            title={t('artifacts.export_html')}
            aria-label={t('artifacts.export_html')}
            className="size-8 text-muted-foreground hover:bg-accent"
          >
            <HugeiconsIcon icon={FileDownIcon} className="size-3.5" aria-hidden />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onCopy}
          className="h-auto gap-1 px-2 py-1 text-[12px] text-muted-foreground hover:bg-accent"
        >
          <HugeiconsIcon
            icon={copied ? CheckIcon : CopyIcon}
            className={cn('size-3', copied && 'text-[var(--success)]')}
            aria-hidden
          />
          <span className={copied ? 'text-[var(--success)]' : undefined}>
            {copied ? t('common.copied') : t('common.copy')}
          </span>
        </Button>
      </div>
    </div>
  );
}

function getArtifactTitle(artifact: AnyArtifact): string {
  switch (artifact.type) {
    case 'pdf_summary': return i18n.t('artifacts.pdf_summary');
    case 'table': return i18n.t('artifacts.table');
    case 'action_items': return i18n.t('artifacts.action_items');
    case 'chart': return i18n.t('artifacts.chart');
    case 'code': return i18n.t('artifacts.code');
    case 'list': return i18n.t('artifacts.list');
    case 'created_entity': {
      const e = artifact as CreatedEntityArtifact;
      return e.entityType === 'agent'
        ? i18n.t('artifacts.agent_named', { name: e.name })
        : i18n.t('artifacts.automation_named', { name: e.name });
    }
    case 'docling_images': {
      const d = artifact as DoclingImagesArtifact;
      const title = d.resource_title || d.title || i18n.t('artifacts.document');
      return i18n.t('artifacts.figures_named', { title, count: d.images?.length ?? 0 });
    }
    case 'calculator':
      return (artifact as CalculatorArtifactV).title || i18n.t('artifacts.calculator');
    case 'diagram':
      return (artifact as DiagramArtifactV).title || i18n.t('artifacts.diagram');
    case 'tabs':
      return (artifact as TabsArtifactV).title || i18n.t('artifacts.tabs');
    case 'playground':
      return (artifact as PlaygroundArtifactV).title || i18n.t('artifacts.playground');
    case 'dashboard':
      return (artifact as DashboardArtifactV).title || i18n.t('artifacts.dashboard');
    case 'timeline':
      return (artifact as TimelineArtifactV).title || i18n.t('artifacts.timeline');
    case 'html':
      return (artifact as HtmlArtifactV).title || i18n.t('artifacts.html');
    case 'calendar_event':
      return (artifact as CalendarEventArtifactV).title || i18n.t('artifacts.calendar_event');
    case 'flashcard_deck':
      return (artifact as FlashcardDeckArtifactV).title || i18n.t('artifacts.flashcard_deck');
    default: return i18n.t('artifacts.content');
  }
}

function getArtifactContent(artifact: AnyArtifact): ReactNode {
  switch (artifact.type) {
    case 'pdf_summary': return <PDFSummaryContent artifact={artifact} />;
    case 'table': return <TableContent artifact={artifact} />;
    case 'action_items': return <ActionItemsContent artifact={artifact} />;
    case 'chart': return <ChartContent artifact={artifact} />;
    case 'code': return <CodeContent artifact={artifact} />;
    case 'list': return <ListContent artifact={artifact} />;
    case 'created_entity': return <CreatedEntityContent artifact={artifact as CreatedEntityArtifact} />;
    case 'docling_images': return <LegacyDoclingImagesNotice />;
    case 'calculator': return <CalculatorArtifact artifact={artifact as CalculatorArtifactV} />;
    case 'diagram': return <DiagramArtifact artifact={artifact as DiagramArtifactV} />;
    case 'tabs': return <TabsArtifact artifact={artifact as TabsArtifactV} />;
    case 'playground': return <PlaygroundArtifact artifact={artifact as PlaygroundArtifactV} />;
    case 'dashboard': return <DashboardArtifact artifact={artifact as DashboardArtifactV} />;
    case 'timeline': return <TimelineArtifact artifact={artifact as TimelineArtifactV} />;
    case 'html': return <HtmlHtmlBridge artifact={artifact as HtmlArtifactV} />;
    case 'calendar_event':
      return <CalendarEventArtifact artifact={artifact as CalendarEventArtifactV} />;
    case 'flashcard_deck':
      return <FlashcardDeckArtifact artifact={artifact as FlashcardDeckArtifactV} />;
    default: return null;
  }
}

function HtmlHtmlBridge({ artifact }: { artifact: HtmlArtifactV }) {
  const themeSnapshot = useDomeThemeSnapshot();
  const openWindow = (srcdoc: string) => {
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return;
    // Keep the external window visually aligned with Dome: inject the theme
    // snapshot tokens + reset just before the existing <style id="dome-theme">.
    // The iframe bootstrap will handle subsequent theme updates on its own when
    // we postMessage — but for the external popup we simply write a fresh doc.
    const themeCss = buildDomeThemeStyleContent(themeSnapshot.vars);
    const withTokens = srcdoc.replace(
      /<style id="dome-theme">[\s\S]*?<\/style>/,
      `<style id="dome-theme">${themeCss}</style>`,
    );
    w.document.write(withTokens);
    w.document.close();
  };
  return <HtmlArtifactFrame artifact={artifact} onOpenNewWindow={openWindow} />;
}

// =============================================================================
// Content Components
// =============================================================================

function PDFSummaryContent({ artifact }: { artifact: PDFSummaryArtifact }) {
  const { t } = useTranslation();
  const [showFull, setShowFull] = useState(false);
  const maxPreviewLength = 800;
  const shouldTruncate = artifact.text.length > maxPreviewLength;

  const displayText = showFull || !shouldTruncate
    ? artifact.text
    : artifact.text.substring(0, maxPreviewLength) + '...';

  return (
    <div className="flex flex-col gap-3 p-3">
      {artifact.metadata && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {artifact.metadata.author && (
            <span><span className="font-semibold">{t('artifacts.author')}:</span> {artifact.metadata.author}</span>
          )}
          {artifact.total_pages && (
            <span><span className="font-semibold">{t('artifacts.pages')}:</span> {artifact.total_pages}</span>
          )}
          <span><span className="font-semibold">{t('artifacts.characters')}:</span> {artifact.chars_extracted.toLocaleString()}</span>
        </div>
      )}

      <div className="text-[13px] leading-relaxed text-foreground">
        <div className="whitespace-pre-wrap break-words">{displayText}</div>
        {shouldTruncate && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setShowFull(!showFull)}
            className="mt-2 h-auto p-0 text-xs"
          >
            {showFull ? t('artifacts.show_less') : t('artifacts.show_more')}
          </Button>
        )}
      </div>

      <div className="flex gap-3 border-t border-border pt-2">
        <a
          href={`dome://resource/${artifact.resource_id}/pdf`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary no-underline"
        >
          <HugeiconsIcon icon={ExternalLinkIcon} className="size-3" />
          {t('artifacts.open_pdf')}
        </a>
        {artifact.metadata?.page && (
          <a
            href={`dome://resource/${artifact.resource_id}/pdf?page=${artifact.metadata.page}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary no-underline"
          >
            <HugeiconsIcon icon={ExternalLinkIcon} className="size-3" />
            {t('artifacts.go_to_page', { page: artifact.metadata.page })}
          </a>
        )}
      </div>
    </div>
  );
}

function TableContent({ artifact }: { artifact: TableArtifact }) {
  return (
    <div className="p-3">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {artifact.headers.map((header, idx) => (
              <TableHead key={idx} className="whitespace-normal bg-accent text-foreground">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {artifact.rows.map((row, rowIdx) => (
            <TableRow key={rowIdx}>
              {row.map((cell, cellIdx) => (
                <TableCell key={cellIdx} className="whitespace-normal text-muted-foreground">
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ActionItemsContent({ artifact }: { artifact: ActionItemsArtifact }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 p-3">
      {artifact.items.map((item, idx) => (
        <div key={item.id || idx} className="flex items-start gap-2 text-[13px]">
          <div
            className={cn(
              'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[3px]',
              item.completed ? 'bg-[var(--success)]' : 'border border-border',
            )}
          >
            {item.completed && <HugeiconsIcon icon={CheckIcon} className="size-2.5 text-background" />}
          </div>
          <div className="min-w-0 flex-1">
            <span className={cn('text-foreground', item.completed && 'line-through opacity-60')}>
              {item.text}
            </span>
            {(item.assignee || item.due_date) && (
              <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                {item.assignee && <span>@{item.assignee}</span>}
                {item.due_date && <span>{t('artifacts.due')} {item.due_date}</span>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartContent({ artifact }: { artifact: ChartArtifact }) {
  const maxValue = Math.max(...artifact.data.datasets.flatMap((d) => d.data), 1);

  return (
    <div className="p-3">
      <div className="mb-3 text-[13px] font-semibold text-foreground">{artifact.title}</div>
      <div className="flex flex-col gap-2">
        {artifact.data.labels.map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-[3px] bg-accent">
              {artifact.data.datasets.map((dataset, dIdx) => (
                <div
                  key={dIdx}
                  className="h-full origin-left rounded-[3px] transition-transform duration-300 ease-out"
                  style={{
                    width: '100%',
                    backgroundColor: sanitizeChartColor(dataset.color),
                    transform: `scaleX(${dataset.data[idx] / maxValue})`,
                  }}
                />
              ))}
            </div>
            <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
              {artifact.data.datasets[0]?.data[idx]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodeContent({ artifact }: { artifact: CodeArtifact }) {
  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {artifact.language}
        </span>
      </div>
      <pre className="m-0 overflow-x-auto rounded-md bg-card p-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{artifact.code}</code>
      </pre>
    </div>
  );
}

function ListContent({ artifact }: { artifact: ListArtifact }) {
  const ListTag = artifact.ordered ? 'ol' : 'ul';
  const items = artifact.items;

  return (
    <div className="p-3">
      <ListTag className={cn('m-0 flex flex-col gap-1 pl-5 text-[13px] text-foreground', artifact.ordered ? 'list-decimal' : 'list-disc')}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

/** Legacy chat artifacts from Docling — figures are no longer stored; show guidance only. */
function LegacyDoclingImagesNotice() {
  const { t } = useTranslation();
  return (
    <p className="m-0 p-3 text-xs leading-relaxed text-muted-foreground">
      {t('artifacts.docling_legacy')}
    </p>
  );
}

function navigateToSection(section: string) {
  window.dispatchEvent(new CustomEvent('dome:navigate-section', { detail: section }));
}

function CreatedEntityContent({ artifact }: { artifact: CreatedEntityArtifact }) {
  const { t } = useTranslation();
  const isAgent = artifact.entityType === 'agent';
  const accent = isAgent ? ACCENT_CLASSES.primary : ACCENT_CLASSES.warning;
  const entityIcon = isAgent ? BotIcon : ZapIcon;

  const configEntries = artifact.config
    ? Object.entries(artifact.config).filter(([, v]) => v !== null && v !== undefined && v !== '')
    : [];

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2.5">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px]', accent.iconBg)}>
          <HugeiconsIcon icon={entityIcon} className={cn('size-[18px]', accent.icon)} />
        </div>
        <div>
          <p className="m-0 text-sm font-semibold text-foreground">{artifact.name}</p>
          {artifact.description && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{artifact.description}</p>
          )}
        </div>
      </div>

      {configEntries.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-muted px-2.5 py-2">
          {configEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-xs">
              <span className="shrink-0 font-medium capitalize text-muted-foreground">
                {k.replace(/_/g, ' ')}:
              </span>
              <span className="break-words text-muted-foreground">
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-border pt-2.5">
        {isAgent ? (
          <>
            <Button type="button" size="sm" onClick={() => navigateToSection(`agent:${artifact.id}`)}>
              <HugeiconsIcon icon={BubbleChatIcon} /> {t('artifacts.chat')}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => navigateToSection('automations-hub')}>
              <HugeiconsIcon icon={ArrowUpRight01Icon} /> {t('artifacts.view_in_hub')}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            className="bg-[var(--warning)] text-primary-foreground hover:bg-[var(--warning)]/80"
            onClick={() => navigateToSection('automations-hub')}
          >
            <HugeiconsIcon icon={PlayIcon} /> {t('artifacts.view_and_run')}
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ArtifactCard({ artifact, onOpenResource: _onOpenResource, className }: ArtifactCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  const accent = getAccentClasses(artifact.type);

  const handleCopy = async () => {
    let contentToCopy = '';

    switch (artifact.type) {
      case 'pdf_summary':
        contentToCopy = (artifact as PDFSummaryArtifact).text;
        break;
      case 'table':
        contentToCopy =
          (artifact as TableArtifact).headers.join('\t') +
          '\n' +
          (artifact as TableArtifact).rows.map((row) => row.join('\t')).join('\n');
        break;
      case 'action_items':
        contentToCopy = (artifact as ActionItemsArtifact).items
          .map((item) => `${item.completed ? '[x]' : '[ ]'} ${item.text}`)
          .join('\n');
        break;
      case 'code':
        contentToCopy = (artifact as CodeArtifact).code;
        break;
      case 'list':
        contentToCopy = (artifact as ListArtifact).items.join('\n');
        break;
      case 'docling_images':
        contentToCopy = i18n.t('artifacts.docling_legacy');
        break;
      default:
        contentToCopy = JSON.stringify(artifact, null, 2);
    }

    try {
      await navigator.clipboard.writeText(contentToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className={cn('overflow-hidden rounded-md border border-border border-l-[3px] bg-card shadow-sm', accent.border, className)}>
      <ArtifactHeader
        artifact={artifact}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        onCopy={handleCopy}
        copied={copied}
      />

      {expanded && (
        <div className="animate-in fade-in duration-200">
          {getArtifactContent(artifact)}
        </div>
      )}
    </div>
  );
}

// Export types for external use
export type { ArtifactCardProps };
