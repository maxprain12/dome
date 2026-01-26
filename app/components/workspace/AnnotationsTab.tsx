'use client';

import { useState, useCallback } from 'react';
import { Trash2, Loader2, MessageSquare, FileText, Clock } from 'lucide-react';
import { useInteractions, type ParsedInteraction } from '@/lib/hooks/useInteractions';

interface AnnotationsTabProps {
  resourceId: string;
}

export default function AnnotationsTab({ resourceId }: AnnotationsTabProps) {
  const {
    annotations,
    isLoading,
    error,
    deleteInteraction,
  } = useInteractions(resourceId);

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this annotation?')) {
        await deleteInteraction(id);
      }
    },
    [deleteInteraction]
  );

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const getPositionLabel = (annotation: ParsedInteraction) => {
    const pos = annotation.position_data;
    if (!pos) return null;

    if (pos.type === 'pdf_highlight') {
      return `Page ${(pos.pageIndex || 0) + 1}`;
    } else if (pos.type === 'video_timestamp') {
      const seconds = pos.timestamp || 0;
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return null;
  };

  const getSelectedText = (annotation: ParsedInteraction) => {
    const pos = annotation.position_data;
    return pos?.selectedText || null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-primary)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--secondary)' }}>
          Annotations are created by selecting text in PDFs or marking timestamps in videos.
        </p>
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {annotations.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare
              className="w-10 h-10 mx-auto mb-3"
              style={{ color: 'var(--tertiary)' }}
            />
            <p className="text-sm" style={{ color: 'var(--secondary)' }}>
              No annotations yet
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--tertiary)' }}>
              Select text in the PDF or click a timestamp in a video to create an annotation
            </p>
          </div>
        ) : (
          annotations.map((annotation) => (
            <div
              key={annotation.id}
              className="p-3 rounded-lg group"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              {/* Position indicator */}
              {getPositionLabel(annotation) && (
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium mb-2"
                  style={{
                    background: 'var(--brand-primary)',
                    color: 'white',
                  }}
                >
                  <FileText size={12} />
                  {getPositionLabel(annotation)}
                </div>
              )}

              {/* Selected text (quote) */}
              {getSelectedText(annotation) && (
                <div
                  className="p-2 rounded mb-2 text-sm italic"
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    borderLeft: '3px solid var(--brand-primary)',
                    color: 'var(--secondary)',
                  }}
                >
                  "{getSelectedText(annotation)}"
                </div>
              )}

              {/* Annotation content (user's note) */}
              {annotation.content && (
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: 'var(--primary)' }}
                >
                  {annotation.content}
                </p>
              )}

              {/* Footer */}
              <div
                className="flex items-center justify-between mt-2 pt-2 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--tertiary)' }}>
                  <Clock size={12} />
                  {formatDate(annotation.created_at)}
                </div>
                <button
                  onClick={() => handleDelete(annotation.id)}
                  className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                  style={{ color: 'var(--secondary)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = '#ef4444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--secondary)';
                  }}
                  title="Delete annotation"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
