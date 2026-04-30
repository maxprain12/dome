
import { useState, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Globe,
  Search,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  Plug,
  FileTextIcon,
  Image,
  PlusCircle,
  Calendar,
  ShoppingBag,
  GitBranch,
  Crop,
  Layers,
  Bot,
  Zap,
  Network,
  GraduationCap,
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard, { type AnyArtifact, type ArtifactType } from './ArtifactCard';
import { tryParseArtifact, ZOD_VALIDATED_ARTIFACT_TYPES } from '@/lib/chat/artifactSchemas';
import { useManyStore } from '@/lib/store/useManyStore';
import { parseContentImages, parseImageResult } from '@/lib/chat/image-tool-utils';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import { getToolDisplayLabel } from '@/lib/chat/toolDisplayLabels';
import { extractCalendarEventFromToolResult, unwrapToolResultPayload } from '@/lib/chat/calendarToolArtifact';

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
}

interface ChatToolCardProps {
  toolCall: ToolCallData;
  className?: string;
}

type ToolCategory = 'search' | 'file' | 'agent' | 'db' | 'mcp' | 'default';

/** Category color accent (border/dot color) using CSS variables for theme compatibility */
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: 'var(--accent)',   // blue
  file: 'var(--success)',     // green
  agent: 'var(--accent)',    // purple
  db: 'var(--warning)',       // orange
  mcp: 'var(--secondary-text)',      // gray
  default: 'var(--secondary-text)',  // gray
};

function getCategory(name: string): ToolCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('search') || n.includes('web_fetch') || n.includes('web_search') || n.includes('fetch')) return 'search';
  if (n.includes('calendar')) return 'db';
  if (n.includes('marketplace')) return 'mcp';
  if (n.includes('flashcard')) return 'file';
  if (n.includes('pdf') || n.includes('file') || n.includes('resource') || n.includes('image') || n.includes('notebook')) return 'file';
  if (n.includes('agent') || n.includes('call_') || n.includes('delegate')) return 'agent';
  if (n.includes('postgres') || n.includes('sql') || n.includes('query') || n.includes('database') || n.includes('db')) return 'db';
  if (n.startsWith('mcp') || n.includes('mcp_')) return 'mcp';
  return 'default';
}

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Search,
  web_fetch: Globe,
  resource_create: FileText,
  resource_get: FileText,
  resource_search: Search,
  call_research_agent: Search,
  call_library_agent: FileText,
  call_writer_agent: FileText,
  call_data_agent: Database,
  notebook_add_cell: FileText,
  notebook_update_cell: FileText,
  notebook_delete_cell: FileText,
  pdf_extract_text: FileTextIcon,
  pdf_get_metadata: FileTextIcon,
  pdf_get_structure: FileTextIcon,
  pdf_summarize: FileTextIcon,
  pdf_extract_tables: FileTextIcon,
  pdf_render_page: Image,
  marketplace_search: ShoppingBag,
  marketplace_install: ShoppingBag,
  browser_get_active_tab: Globe,
  workflow_create: GitBranch,
  agent_create: Bot,
  automation_create: Zap,
  image_crop: Crop,
  image_thumbnail: Layers,
  generate_mindmap: Network,
  generate_quiz: GraduationCap,
  generate_knowledge_graph: Network,
  calendar_list_events: Calendar,
  calendar_list: Calendar,
  calendar_get_upcoming: Calendar,
  calendar_create: Calendar,
  calendar_create_event: Calendar,
  calendar_update: Calendar,
  calendar_update_event: Calendar,
  calendar_delete: Calendar,
  calendar_delete_event: Calendar,
  flashcard_create: Layers,
};

function renderToolSuccessHighlight(
  toolName: string,
  rawResult: unknown,
  t: (key: string, opts?: Record<string, unknown> & { defaultValue?: string }) => string,
): ReactNode | null {
  const cal = extractCalendarEventFromToolResult(toolName, rawResult);
  if (cal) {
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
          <span className="truncate">{cal.title || t('chat.calendar_event_untitled', { defaultValue: 'Evento' })}</span>
        </div>
        {cal.startLabel ? (
          <p className="text-[11px]" style={{ color: 'var(--secondary-text)' }}>
            {cal.startLabel}
            {cal.endLabel && cal.endLabel !== cal.startLabel ? ` → ${cal.endLabel}` : ''}
          </p>
        ) : null}
        {cal.location ? (
          <p className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
            {cal.location}
          </p>
        ) : null}
        {cal.id ? (
          <p className="text-[10px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {cal.id}
          </p>
        ) : null}
      </div>
    );
  }

  const parsed = unwrapToolResultPayload(rawResult);
  if (!parsed) return null;
  const n = (toolName || '').toLowerCase();
  const ok = parsed.success === true || parsed.status === 'success';

  if (n === 'flashcard_create' && ok && parsed.deck && typeof parsed.deck === 'object') {
    const deck = parsed.deck as Record<string, unknown>;
    const title = String(deck.title || '');
    const count = typeof deck.card_count === 'number' ? deck.card_count : 0;
    return (
      <div
        className="rounded-md border p-2.5 space-y-1"
        style={{
          borderColor: 'var(--border)',
          background: 'color-mix(in srgb, var(--success) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--primary-text)' }}>
          <Layers className="w-3.5 h-3.5 shrink-0 text-[var(--success)]" aria-hidden />
          <span className="truncate">{title}</span>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--secondary-text)' }}>
          {t('chat.flashcard_deck_count', { count, defaultValue: '{{count}} tarjetas' })}
        </p>
      </div>
    );
  }

  if (n === 'resource_create' && ok && parsed.resource && typeof parsed.resource === 'object') {
    const r = parsed.resource as Record<string, unknown>;
    const title = String(r.title || '');
    const id = String(r.id || '');
    const typ = String(r.type || '');
    return (
      <div
        className="rounded-md border p-2.5 flex gap-2 items-start"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
      >
        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--accent)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
            {title}
          </p>
          <p className="text-[10px] font-mono opacity-70 truncate" style={{ color: 'var(--tertiary-text)' }}>
            {typ} · {id}
          </p>
        </div>
      </div>
    );
  }

  const st = parsed.status;
  if (st === 'success') {
    const thumb = typeof parsed.thumbnail === 'string' ? parsed.thumbnail : '';
    const cropped = typeof parsed.croppedImage === 'string' ? parsed.croppedImage : '';
    const src = cropped || thumb;
    if (src.startsWith('data:')) {
      return (
        <img
          src={src}
          alt=""
          className="max-w-[220px] max-h-[160px] object-contain rounded-md border border-[var(--border)]"
        />
      );
    }
  }

  return null;
}

function getIconForTool(name: string): typeof Globe {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) return Database;
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug;
  return Globe;
}

/** Parse result as document-style array [{ content, metadata }] */
function parseDocumentResult(result: unknown): Array<{ content?: string; metadata?: Record<string, unknown> }> | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else {
    parsed = result;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const valid = parsed.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      (typeof (item as { content?: unknown }).content === 'string' ||
        typeof (item as { metadata?: unknown }).metadata === 'object')
  );
  return valid ? (parsed as Array<{ content?: string; metadata?: Record<string, unknown> }>) : null;
}

/** Parse result as artifact */
function parseArtifactResult(result: unknown): AnyArtifact | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else if (result && typeof result === 'object') {
    parsed = result;
  } else {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  let artifact: AnyArtifact | undefined;
  if (obj.artifact && typeof obj.artifact === 'object') artifact = obj.artifact as AnyArtifact;
  if (!artifact && obj.content && Array.isArray(obj.content)) {
    const textContent = obj.content[0]?.text;
    if (typeof textContent === 'string') {
      try {
        const p = JSON.parse(textContent);
        if (p.artifact) artifact = p.artifact as AnyArtifact;
      } catch { /* Not JSON */ }
    }
  }
  if (!artifact && obj.details && typeof obj.details === 'object') {
    const details = obj.details as Record<string, unknown>;
    if (details.artifact) artifact = details.artifact as AnyArtifact;
  }
  if (!artifact) return null;
  const artifactType = (artifact as { type?: string }).type as ArtifactType | undefined;
  if (!artifactType) return null;
  const legacyTypes: ArtifactType[] = [
    'pdf_summary',
    'table',
    'action_items',
    'chart',
    'code',
    'list',
    'created_entity',
    'docling_images',
  ];
  if (ZOD_VALIDATED_ARTIFACT_TYPES.has(artifactType)) {
    const validated = tryParseArtifact(artifactType, artifact);
    if (!validated.ok) return null;
    return validated.value as AnyArtifact;
  }
  if (!legacyTypes.includes(artifactType)) return null;
  return artifact;
}

/**
 * Simple JSON pretty-printer that renders key-value pairs with alternating row backgrounds.
 * No external libraries needed.
 */
function JsonPrettyPrinter({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null) return <span style={{ color: 'var(--tertiary-text)' }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: 'var(--warning)' }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: 'var(--success)' }}>{value}</span>;
  if (typeof value === 'string') {
    return <span style={{ color: 'var(--secondary-text)' }}>"{value}"</span>;
  }
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
          <div
            key={k}
            style={{
              display: 'flex',
              gap: 6,
              padding: '2px 6px',
              borderRadius: 3,
              background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-hover) 50%, transparent)',
            }}
          >
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

interface ResourceItem {
  id: string;
  title: string;
  type: string;
  snippet?: string;
  similarity?: number;
}

function parseResourceItems(toolName: string, result: unknown): ResourceItem[] | null {
  const n = (toolName || '').toLowerCase();
  if (!n.includes('resource_list') && !n.includes('resource_search') && !n.includes('resource_semantic')) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try { parsed = JSON.parse(result); } catch { return null; }
  } else {
    parsed = result;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const arr = Array.isArray(obj.results) ? obj.results : Array.isArray(obj.resources) ? obj.resources : null;
  if (!arr) return null;
  return arr
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || ''),
      title: String(item.title || '(sin título)'),
      type: String(item.type || 'resource'),
      snippet: typeof item.snippet === 'string' ? item.snippet : undefined,
      similarity: typeof item.similarity === 'number' ? item.similarity : undefined,
    }))
    .filter((item) => item.id);
}

/** Format args as a short single-line summary, truncated at ~60 chars */
function formatArgsSummary(args: Record<string, unknown>): string {
  const parts = Object.entries(args || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  const joined = parts.join(', ');
  if (joined.length > 60) return joined.slice(0, 60) + '…';
  return joined;
}

export default function ChatToolCard({ toolCall, className = '' }: ChatToolCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const Icon = getIconForTool(toolCall.name);
  const label = getToolDisplayLabel(toolCall.name, t);
  const category = getCategory(toolCall.name);
  const accentColor = CATEGORY_COLORS[category];

  const documentItems = useMemo(() => parseDocumentResult(toolCall.result), [toolCall.result]);
  const artifactItems = useMemo(() => parseArtifactResult(toolCall.result), [toolCall.result]);
  const imageItems = useMemo(() => parseImageResult(toolCall.result), [toolCall.result]);
  const contentImages = useMemo(() => parseContentImages(toolCall.result), [toolCall.result]);
  const resourceItems = useMemo(() => parseResourceItems(toolCall.name, toolCall.result), [toolCall.name, toolCall.result]);
  const pinnedIds = useMemo(() => new Set(pinnedResources.map((r) => r.id)), [pinnedResources]);

  const formatResult = (result: unknown): string => {
    if (typeof result === 'string') return result;
    if (result === null || result === undefined) return '';
    try { return JSON.stringify(result, null, 2); } catch { return String(result); }
  };

  const parsedResult = useMemo(() => {
    if (!toolCall.result) return null;
    if (typeof toolCall.result === 'object') return toolCall.result;
    if (typeof toolCall.result === 'string') {
      try { return JSON.parse(toolCall.result); } catch { return null; }
    }
    return null;
  }, [toolCall.result]);

  const resultText = formatResult(toolCall.result);
  const isPending = toolCall.status === 'pending' || toolCall.status === 'running';
  const argsSummary = formatArgsSummary(toolCall.arguments);

  const renderResultContent = () => {
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
      const highlight = renderToolSuccessHighlight(toolCall.name, toolCall.result, t);
      if (highlight) {
        return <div style={{ marginTop: 4 }}>{highlight}</div>;
      }
    }

    if (showRawJson) {
      return (
        <pre
          style={{
            fontSize: 11,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowY: 'auto',
            maxHeight: 256,
            color: 'var(--secondary-text)',
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
            margin: 0,
          }}
        >
          {resultText}
        </pre>
      );
    }

    if (documentItems && documentItems.length > 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {documentItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
          ))}
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
      return (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contentImages.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.label && (
                <p style={{ fontSize: 11, color: 'var(--secondary-text)', margin: 0 }}>{item.label}</p>
              )}
              <img
                src={item.dataUrl}
                alt={item.label || `Figure ${idx + 1}`}
                style={{
                  maxWidth: 280,
                  maxHeight: 200,
                  objectFit: 'contain',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              />
            </div>
          ))}
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
                    <span style={{ fontSize: 11, color: 'var(--tertiary-text)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                  className="!p-0 w-5 h-5 min-w-0 shrink-0 text-[var(--tertiary-text)] hover:text-[var(--accent)]"
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
            fontSize: 11,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            overflowY: 'auto',
            maxHeight: 256,
            background: 'var(--bg-tertiary)',
            borderRadius: 4,
            padding: '8px 10px',
          }}
        >
          <JsonPrettyPrinter value={parsedResult} />
        </div>
      );
    }

    return (
      <pre
        style={{
          fontSize: 11,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowY: 'auto',
          maxHeight: 256,
          color: 'var(--secondary-text)',
          background: 'var(--bg-tertiary)',
          borderRadius: 4,
          padding: '8px 10px',
          margin: 0,
        }}
      >
        {resultText}
      </pre>
    );
  };

  const hasResult = Boolean(toolCall.result || toolCall.error);
  const canExpand = !isPending && hasResult;

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
            <div className="flex shrink-0 w-4 h-4 items-center justify-center">
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
              </span>
              {argsSummary ? (
                <span className="text-[11px] text-[var(--tertiary-text)] leading-snug mt-px truncate">
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
                  className="!h-auto !px-0 !py-0 font-mono text-[10px] underline text-[var(--tertiary-text)] opacity-70 hover:opacity-100"
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
}

export function ChatToolCardGroup({ name, calls, className = '' }: ChatToolCardGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const Icon = getIconForTool(name);
  const label = getToolDisplayLabel(name, t);
  const category = getCategory(name);
  const accentColor = CATEGORY_COLORS[category];
  const count = calls.length;
  const hasError = calls.some((c) => c.status === 'error');
  const hasPending = calls.some((c) => c.status === 'pending' || c.status === 'running');
  const allSuccess = calls.every((c) => c.status === 'success');

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
            <div className="flex shrink-0 w-4 h-4 items-center justify-center">
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
          <ChatToolCard key={tc.id} toolCall={tc} />
        ))}
      </DomeCollapsibleRow>
    </div>
  );
}
