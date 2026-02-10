
import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Link2,
  File,
  MessageSquare,
  StickyNote,
  Brain,
  GitBranch,
  Search,
} from 'lucide-react';

interface SearchResultsProps {
  results: {
    resources: any[];
    interactions: any[];
  };
  query: string;
  isLoading: boolean;
  onSelect: (resource: any) => void;
}

export function SearchResults({ results, query, isLoading, onSelect }: SearchResultsProps) {
  const getResourceIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <FileText size={16} />;
      case 'pdf':
      case 'document':
        return <File size={16} />;
      case 'image':
        return <ImageIcon size={16} />;
      case 'video':
        return <Video size={16} />;
      case 'audio':
        return <Music size={16} />;
      case 'url':
        return <Link2 size={16} />;
      default:
        return <File size={16} />;
    }
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'note':
        return <StickyNote size={14} />;
      case 'annotation':
        return <MessageSquare size={14} />;
      case 'chat':
        return <MessageSquare size={14} />;
      default:
        return <StickyNote size={14} />;
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="highlight">{part}</mark>
      ) : (
        part
      )
    );
  };

  const truncateText = (text: string, maxLength: number = 120) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '…';
  };

  const getSourceBadge = (resource: any) => {
    const source = resource.source;
    if (!source) return null;

    const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      vector: { label: 'Semantic', icon: <Brain size={10} />, className: 'source-badge source-semantic' },
      graph: { label: 'Related', icon: <GitBranch size={10} />, className: 'source-badge source-graph' },
      fts: { label: 'Text', icon: <Search size={10} />, className: 'source-badge source-text' },
    };

    const badge = config[source];
    if (!badge) return null;

    return (
      <span className={badge.className}>
        {badge.icon}
        {badge.label}
      </span>
    );
  };

  const hasResources = results.resources.length > 0;
  const hasInteractions = results.interactions.length > 0;

  if (isLoading) {
    return (
      <div className="search-results">
        <div className="loading-state">
          <div className="skeleton skeleton-item" />
          <div className="skeleton skeleton-item" />
          <div className="skeleton skeleton-item" />
        </div>

      </div>
    );
  }

  return (
    <div className="search-results">
      {/* Resources section */}
      {hasResources && (
        <div className="results-section">
          <div className="section-label">Resources</div>
          <div className="results-list">
            {results.resources.slice(0, 10).map((resource) => (
              <button
                key={resource.id}
                className="result-item"
                onClick={() => onSelect(resource)}
              >
                <div className="result-icon" data-type={resource.type}>
                  {getResourceIcon(resource.type)}
                </div>
                <div className="result-content">
                  <div className="result-title">
                    {highlightMatch(resource.title || 'Untitled', query)}
                  </div>
                  {resource.content && (
                    <div className="result-preview">
                      {highlightMatch(truncateText(stripHtml(resource.content)), query)}
                    </div>
                  )}
                </div>
                <div className="result-meta">
                  {getSourceBadge(resource)}
                  <div className="result-type">{resource.type}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interactions section (notes, annotations, chat) */}
      {hasInteractions && (
        <div className="results-section">
          <div className="section-label">Notes & Annotations</div>
          <div className="results-list">
            {results.interactions.slice(0, 5).map((interaction) => {
              const metadata = parseJsonField<{ type?: string }>(interaction.metadata);
              const positionData = parseJsonField<{ pageIndex?: number; selectedText?: string }>(interaction.position_data);
              const annotationKind = interaction.type === 'annotation' ? (metadata?.type || interaction.type) : interaction.type;
              const snippet = getInteractionSnippet(interaction, annotationKind, positionData);
              const badgeLabel = getAnnotationBadgeLabel(interaction.type, metadata);
              const pageLabel = positionData?.pageIndex != null ? ` · p. ${positionData.pageIndex + 1}` : '';
              return (
                <button
                  key={interaction.id}
                  className="result-item interaction"
                  onClick={() => onSelect({ id: interaction.resource_id, title: interaction.resource_title })}
                >
                  <div className="result-icon" data-type={interaction.type}>
                    {getInteractionIcon(interaction.type)}
                  </div>
                  <div className="result-content">
                    <div className="result-title interaction-title">
                      <span className="interaction-badge">{badgeLabel}</span>
                      in {interaction.resource_title}{pageLabel}
                    </div>
                    {snippet && (
                      <div className="result-preview">
                        {highlightMatch(truncateText(snippet), query)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}



    </div>
  );
}



function escapeRegex(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripHtml(html: string) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function parseJsonField<T = Record<string, unknown>>(val: unknown): T {
  if (val == null) return {} as T;
  if (typeof val === 'object') return val as T;
  try {
    return (typeof val === 'string' ? JSON.parse(val || '{}') : {}) as T;
  } catch {
    return {} as T;
  }
}

function getAnnotationBadgeLabel(interactionType: string, metadata?: { type?: string }): string {
  if (interactionType === 'annotation' && metadata?.type === 'highlight') return 'Highlight';
  if (interactionType === 'annotation' && metadata?.type === 'note') return 'Nota';
  if (interactionType === 'note') return 'Nota';
  if (interactionType === 'chat') return 'Chat';
  return interactionType || 'Nota';
}

function getInteractionSnippet(
  interaction: { content?: string },
  annotationKind: string,
  positionData?: { selectedText?: string }
): string {
  if (annotationKind === 'highlight') {
    return (positionData?.selectedText || interaction.content || '').trim();
  }
  return (interaction.content || '').trim();
}

export default SearchResults;
