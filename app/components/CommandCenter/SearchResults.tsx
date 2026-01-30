'use client';

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
                <style jsx>{skeletonStyles}</style>
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
                                <div className="result-type">{resource.type}</div>
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

            <style jsx>{`
        .search-results {
          padding: 8px;
        }

        .results-section {
          margin-bottom: 16px;
        }

        .results-section:last-child {
          margin-bottom: 0;
        }

        .section-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--secondary-text);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 8px 12px 4px;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .result-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          cursor: pointer;
          text-align: left;
          transition: all var(--transition-fast);
        }

        .result-item:hover {
          background: var(--bg-hover);
          border-radius: var(--radius-lg);
        }

        .result-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          color: var(--secondary-text);
          flex-shrink: 0;
        }

        .result-icon[data-type="note"] {
          background: var(--translucent);
          color: var(--accent);
        }

        .result-icon[data-type="pdf"],
        .result-icon[data-type="document"] {
          background: var(--error-bg);
          color: var(--error);
        }

        .result-icon[data-type="image"] {
          background: var(--success-bg);
          color: var(--success);
        }

        .result-icon[data-type="video"] {
          background: var(--info-bg);
          color: var(--info);
        }

        .result-icon[data-type="audio"] {
          background: var(--warning-bg);
          color: var(--warning);
        }

        .result-icon[data-type="url"] {
          background: var(--translucent);
          color: var(--secondary);
        }

        .result-content {
          flex: 1;
          min-width: 0;
        }

        .result-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-preview {
          font-size: 13px;
          color: var(--secondary-text);
          line-height: 1.4;
          margin-top: 2px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .result-type {
          font-size: 11px;
          font-weight: 500;
          color: var(--tertiary-text);
          text-transform: uppercase;
          padding: 2px 6px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          flex-shrink: 0;
        }

        .result-item.interaction .result-icon {
          width: 28px;
          height: 28px;
          background: var(--translucent);
          color: var(--secondary);
        }

        .interaction-title {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .interaction-badge {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          padding: 2px 6px;
          background: var(--translucent);
          color: var(--secondary);
          border-radius: var(--radius-sm);
        }

        .search-results :global(.highlight) {
          background: var(--primary-light);
          color: var(--accent);
          padding: 0 2px;
          border-radius: 2px;
        }
      `}</style>
            <style jsx>{skeletonStyles}</style>
        </div>
    );
}

const skeletonStyles = `
  .loading-state {
    padding: 8px;
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg-tertiary) 25%,
      var(--bg-hover) 50%,
      var(--bg-tertiary) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-md);
  }

  .skeleton-item {
    height: 52px;
    margin-bottom: 8px;
  }

  .skeleton-item:last-child {
    margin-bottom: 0;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

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
