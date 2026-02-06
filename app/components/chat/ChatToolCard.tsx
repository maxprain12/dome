'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Globe, Search, FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';

/**
 * ChatToolCard - Displays tool calls and their results
 * Collapsible card with preview for long outputs
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
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Obteniendo contenido',
  memory_search: 'Buscando en memoria',
  memory_get: 'Obteniendo documento',
};

export default function ChatToolCard({ toolCall, className = '' }: ChatToolCardProps) {
  const [expanded, setExpanded] = useState(false);

  const Icon = TOOL_ICONS[toolCall.name] || Globe;
  const label = TOOL_LABELS[toolCall.name] || toolCall.name;

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
  const argsText = Object.entries(toolCall.arguments)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(', ');

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
          {toolCall.error ? (
            <p className="text-xs" style={{ color: 'var(--error)' }}>{toolCall.error}</p>
          ) : expanded ? (
            <pre 
              className="text-xs whitespace-pre-wrap break-words overflow-auto max-h-64"
              style={{ color: 'var(--secondary-text)' }}
            >
              {resultText}
            </pre>
          ) : (
            <p 
              className="text-xs truncate cursor-pointer"
              style={{ color: 'var(--secondary-text)' }}
              onClick={() => setExpanded(true)}
            >
              {previewText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
