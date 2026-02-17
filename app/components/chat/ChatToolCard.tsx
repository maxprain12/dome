
import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Globe, Search, FileText, Loader2, CheckCircle2, XCircle, Database, Plug } from 'lucide-react';
import MarkdownRenderer from './MarkdownRenderer';

/**
 * ChatToolCard - Displays tool calls and their results
 * Collapsible card with preview for long outputs.
 * Supports MCP/PostgreSQL and document-style results (content + metadata).
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
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Obteniendo contenido',
  memory_search: 'Buscando en memoria',
  memory_get: 'Obteniendo documento',
  resource_create: 'Creando recurso',
  resource_get: 'Obteniendo recurso',
  resource_search: 'Buscando recursos',
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
  const isLongResult = resultText.length > 120;
  const previewText = isLongResult ? resultText.slice(0, 120) + '...' : resultText;

  // Format arguments for display
  const argsText = Object.entries(toolCall.arguments || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');

  const renderResultContent = () => {
    if (toolCall.error) {
      return <p className="text-xs" style={{ color: 'var(--error)' }}>{toolCall.error}</p>;
    }
    if (showRawJson) {
      return (
        <pre className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-64" style={{ color: 'var(--secondary-text)' }}>
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
                <p className="text-xs font-medium" style={{ color: 'var(--primary-text)' }}>
                  {(item.metadata.title as string)}
                </p>
              )}
              {item.metadata?.skills && Array.isArray(item.metadata.skills) && (
                <div className="flex flex-wrap gap-1">
                  {(item.metadata.skills as string[]).map((s, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 rounded text-[10px]"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--secondary-text)' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {item.content && (
                <div className="text-xs prose prose-sm max-w-none" style={{ color: 'var(--secondary-text)' }}>
                  <MarkdownRenderer content={item.content} />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    return (
      <pre className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-64" style={{ color: 'var(--secondary-text)' }}>
        {resultText}
      </pre>
    );
  };

  return (
    <div 
      className={`rounded-lg border transition-all ${className}`}
      style={{ 
        backgroundColor: 'var(--bg-secondary)', 
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-left transition-colors rounded-lg"
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        {/* Status indicator */}
        <div className="flex-shrink-0">
          {toolCall.status === 'pending' && (
            <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: 'var(--border)' }} />
          )}
          {toolCall.status === 'running' && (
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
          )}
          {toolCall.status === 'success' && (
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
          )}
          {toolCall.status === 'error' && (
            <XCircle className="w-4 h-4" style={{ color: 'var(--error)' }} />
          )}
        </div>

        {/* Icon and label */}
        <Icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--secondary-text)' }} />
        <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--primary-text)' }}>
          {label}
        </span>

        {/* Expand/collapse */}
        {(toolCall.result || toolCall.error) && (
          <div className="flex-shrink-0" style={{ color: 'var(--secondary-text)' }}>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        )}
      </button>

      {/* Arguments preview (always visible) */}
      {argsText && (
        <div className="px-3 pb-2 -mt-1">
          <p className="text-xs opacity-60 truncate" style={{ color: 'var(--secondary-text)' }}>
            {argsText}
          </p>
        </div>
      )}

      {/* Result/Error content */}
      {(toolCall.result || toolCall.error) && (
        <div className="border-t px-3 py-2" style={{ borderColor: 'var(--border)' }}>
          {expanded ? (
            <>
              {documentItems && (
                <button
                  type="button"
                  className="text-[10px] mb-2 opacity-60 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--secondary-text)' }}
                  onClick={() => setShowRawJson(!showRawJson)}
                >
                  {showRawJson ? 'Vista formateada' : 'Ver JSON'}
                </button>
              )}
              {renderResultContent()}
            </>
          ) : (
            <button
              type="button"
              className="text-xs truncate cursor-pointer w-full text-left bg-transparent border-none p-0 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded"
              style={{ color: 'var(--secondary-text)' }}
              onClick={() => setExpanded(true)}
              aria-label="Expand tool result"
            >
              {documentItems
                ? (documentItems[0]?.metadata?.title as string) || previewText
                : previewText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
