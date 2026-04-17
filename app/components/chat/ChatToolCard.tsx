
import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';
import ArtifactCard, { type AnyArtifact, type ArtifactType } from './ArtifactCard';
import { useManyStore } from '@/lib/store/useManyStore';
import { parseContentImages, parseImageResult } from '@/lib/chat/docling-utils';
import DomeCollapsibleRow from '@/components/ui/DomeCollapsibleRow';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';

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

/** Category color accent (border/dot color) using fixed semantic colors that work in both themes */
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  search: '#3b82f6',   // blue
  file: '#10b981',     // green
  agent: '#8b5cf6',    // purple
  db: '#f59e0b',       // orange
  mcp: '#6b7280',      // gray
  default: '#6b7280',  // gray
};

function getCategory(name: string): ToolCategory {
  const n = (name || '').toLowerCase();
  if (n.includes('search') || n.includes('web_fetch') || n.includes('web_search') || n.includes('fetch')) return 'search';
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
  image_crop: Image,
  image_thumbnail: Image,
  docling_list_images: Image,
  docling_show_image: Image,
  docling_show_page_images: Image,
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Obteniendo contenido',
  resource_create: 'Creando recurso',
  resource_get: 'Obteniendo recurso',
  resource_search: 'Buscando recursos',
  call_research_agent: 'Delegando investigación',
  call_library_agent: 'Delegando consulta de biblioteca',
  call_writer_agent: 'Delegando creación de contenido',
  call_data_agent: 'Delegando procesamiento de datos',
  notebook_add_cell: 'Añadiendo celda',
  notebook_update_cell: 'Actualizando celda',
  notebook_delete_cell: 'Eliminando celda',
  pdf_extract_text: 'Extrayendo texto de PDF',
  pdf_get_metadata: 'Obteniendo metadatos de PDF',
  pdf_get_structure: 'Obteniendo estructura de PDF',
  pdf_summarize: 'Resumiendo PDF',
  pdf_extract_tables: 'Extrayendo tablas de PDF',
  image_crop: 'Recortando imagen',
  image_thumbnail: 'Generando miniatura',
  docling_list_images: 'Listando imágenes del documento',
  docling_show_image: 'Mostrando artefacto visual',
  docling_show_page_images: 'Mostrando figuras del documento',
};

function getIconForTool(name: string): typeof Globe {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) return Database;
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug;
  return Globe;
}

function getLabelForTool(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const norm = (name || '').toLowerCase();
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query')) return 'Consulta a base de datos';
  if (norm.includes('mcp') || norm.startsWith('mcp_')) return 'Tool MCP';
  const humanized = name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return humanized || name;
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
  const artifactType = artifact.type as ArtifactType;
  if (!artifactType) return null;
  const validTypes: ArtifactType[] = ['pdf_summary', 'table', 'action_items', 'chart', 'code', 'list'];
  if (!validTypes.includes(artifactType)) return null;
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
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const Icon = getIconForTool(toolCall.name);
  const label = getLabelForTool(toolCall.name);
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
            alt={imageItems.alt || 'Imagen procesada'}
            style={{
              maxWidth: 200,
              maxHeight: 200,
              objectFit: 'contain',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
            <p style={{ fontWeight: 600, color: 'var(--primary-text)', margin: '0 0 4px' }}>Imagen procesada</p>
            <p style={{ opacity: 0.7, margin: 0 }}>Haz clic para expandir</p>
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
                  title={isPinned ? 'Quitar del contexto' : 'Añadir al contexto del chat'}
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
        borderRadius: '0 4px 4px 0',
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
                <CheckCircle2 className="w-[13px] h-[13px] text-[#10b981]" />
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
                  {showRawJson ? 'Vista formateada' : 'Ver JSON'}
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
  const Icon = getIconForTool(name);
  const label = getLabelForTool(name);
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
        borderRadius: '0 4px 4px 0',
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
                <CheckCircle2 className="w-[13px] h-[13px] text-[#10b981]" />
              ) : (
                <Icon className="w-[13px] h-[13px] text-[var(--tertiary-text)]" />
              )}
            </div>
            <span className="text-[13px] font-semibold text-[var(--secondary-text)] leading-snug">
              {label} ({count})
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
