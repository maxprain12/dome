
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Globe, Search, FileText, Loader2, CheckCircle2, XCircle, Database, Plug } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

/**
 * ChatToolCard - Minimalist display for tool calls
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

const TOOL_ICONS: Record<string, typeof Globe> = {
  web_search: Search,
  web_fetch: Globe,
  memory_search: FileText,
  memory_get: FileText,
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
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Obteniendo contenido',
  memory_search: 'Buscando en memoria',
  memory_get: 'Obteniendo documento',
  resource_create: 'Creando recurso',
  resource_get: 'Obteniendo recurso',
  resource_search: 'Buscando recursos',
  call_research_agent: 'Investigando',
  call_library_agent: 'Consultando biblioteca',
  call_writer_agent: 'Creando contenido',
  call_data_agent: 'Procesando datos',
  notebook_add_cell: 'Añadiendo celda',
  notebook_update_cell: 'Actualizando celda',
  notebook_delete_cell: 'Eliminando celda',
};

function getIconForTool(name: string): typeof Globe {
  const norm = (name || '').toLowerCase();
  if (TOOL_ICONS[name]) return TOOL_ICONS[name];
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query') || norm.includes('database')) {
    return Database;
  }
  if (norm.includes('mcp_') || norm.startsWith('mcp')) return Plug;
  return Globe;
}

function getLabelForTool(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const norm = (name || '').toLowerCase();
  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query')) return 'Consulta a base de datos';
  const humanized = name.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return humanized || name;
}

/** Parse result as document-style array [{ content, metadata }] */
function parseDocumentResult(result: unknown): Array<{ content?: string; metadata?: Record<string, unknown> }> | null {
  if (!result) return null;
  let parsed: unknown;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result);
    } catch {
      return null;
    }
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

export default function ChatToolCard({ toolCall, className = '' }: ChatToolCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const Icon = getIconForTool(toolCall.name);
  const label = getLabelForTool(toolCall.name);

  const documentItems = useMemo(() => parseDocumentResult(toolCall.result), [toolCall.result]);

  // Format result for display
  const formatResult = (result: unknown): string => {
    if (typeof result === 'string') return result;
    if (result === null || result === undefined) return '';
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  };

  const resultText = formatResult(toolCall.result);
  const isPending = toolCall.status === 'pending' || toolCall.status === 'running';

  // Format arguments for display
  const argsText = Object.entries(toolCall.arguments || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');

  const renderResultContent = () => {
    if (toolCall.error) {
      return <p className="text-xs text-[var(--error)]">{toolCall.error}</p>;
    }
    if (showRawJson) {
      return (
        <pre className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-64 text-[var(--secondary-text)]">
          {resultText}
        </pre>
      );
    }
    if (documentItems && documentItems.length > 0) {
      return (
        <div className="space-y-3">
          {documentItems.map((item, idx) => (
            <div key={idx} className="space-y-1.5">
              {item.metadata?.title && (
                <p className="text-xs font-medium text-[var(--primary-text)]">
                  {(item.metadata.title as string)}
                </p>
              )}
              {item.content && (
                <div className="text-xs prose prose-sm max-w-none text-[var(--secondary-text)]">
                  <MarkdownRenderer content={item.content} />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <pre className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-64 text-[var(--secondary-text)]">
        {resultText}
      </pre>
    );
  };

  return (
    <div className={`text-sm ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        disabled={isPending}
        className={`group flex items-center gap-2 py-1 px-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)] max-w-full ${isPending ? 'cursor-default' : 'cursor-pointer'
          }`}
      >
        <div className={`flex items-center justify-center h-5 w-5 rounded transition-colors ${isPending ? 'text-[var(--accent)]' : toolCall.status === 'error' ? 'text-[var(--error)]' : 'text-[var(--tertiary-text)] group-hover:text-[var(--secondary-text)]'
          }`}>
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : toolCall.status === 'error' ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
        </div>

        <span className={`text-[13px] font-medium truncate flex-1 text-left ${isPending ? 'text-[var(--primary-text)]' : 'text-[var(--secondary-text)]'
          }`}>
          {label}
          {argsText && (isPending || expanded) && (
            <span className="ml-2 text-[12px] opacity-60 font-normal">{argsText}</span>
          )}
        </span>

        {!isPending && (toolCall.result || toolCall.error) && (
          <div className="text-[var(--tertiary-text)] opacity-0 group-hover:opacity-100 transition-opacity">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </div>
        )}
      </button>

      {/* Expandable Result Area */}
      {expanded && !isPending && (toolCall.result || toolCall.error) && (
        <div className="mt-1 ml-2 pl-4 border-l border-[var(--border)] py-1 animate-in fade-in duration-200 slide-in-from-top-1">
          {documentItems && (
            <div className="mb-2">
              <button
                type="button"
                className="text-[10px] opacity-60 hover:opacity-100 transition-opacity text-[var(--secondary-text)]"
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? 'Vista formateada' : 'Ver JSON'}
              </button>
            </div>
          )}
          {renderResultContent()}
        </div>
      )}
    </div>
  );
}
