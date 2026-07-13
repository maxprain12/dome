
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  Loading03Icon,
  Comment01Icon,
  File02Icon,
  Clock01Icon,
} from '@hugeicons/core-free-icons';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInteractions, type ParsedInteraction } from '@/lib/hooks/useInteractions';
import { formatRelativeDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface AnnotationsTabProps {
  resourceId: string;
}

function formatAnnotationDate(timestamp: number) {
  return formatRelativeDate(timestamp);
}

function getAnnotationPositionLabel(annotation: ParsedInteraction) {
  const pos = annotation.position_data as Record<string, unknown> | null;
  if (!pos) return null;

  const posType = pos.type as string;
  if (posType === 'pdf_highlight') {
    return `Page ${((pos.pageIndex as number) || 0) + 1}`;
  } else if (posType === 'video_timestamp') {
    const seconds = (pos.timestamp as number) || 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return null;
}

function getAnnotationSelectedText(annotation: ParsedInteraction) {
  const pos = annotation.position_data as Record<string, unknown> | null;
  return (pos?.selectedText as string) || null;
}

export default function AnnotationsTab({ resourceId }: AnnotationsTabProps) {
  const { t } = useTranslation();
  const {
    annotations,
    isLoading,
    error,
    deleteInteraction,
  } = useInteractions(resourceId);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const handleDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (pendingDeleteId) await deleteInteraction(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, deleteInteraction]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <HugeiconsIcon icon={Loading03Icon} className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <p className="text-sm text-muted-foreground">
          Annotations are created by selecting text in PDFs or marking timestamps in videos.
        </p>
      </div>

      {/* Annotations List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {annotations.length === 0 ? (
          <div className="text-center py-8">
            <HugeiconsIcon icon={Comment01Icon}
              className="size-10 mx-auto mb-3 text-muted-foreground"
            />
            <p className="text-sm text-muted-foreground">
              No annotations yet
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              Select text in the PDF or click a timestamp in a video to create an annotation
            </p>
          </div>
        ) : (
          annotations.map((annotation) => (
            <div
              key={annotation.id}
              className="p-3 rounded-lg group"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            >
              {/* Position indicator */}
              {getAnnotationPositionLabel(annotation) && (
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium mb-2"
                  style={{
                    background: 'var(--primary)',
                    color: 'var(--primary-foreground)',
                  }}
                >
                  <HugeiconsIcon icon={File02Icon} size={12} />
                  {getAnnotationPositionLabel(annotation)}
                </div>
              )}

              {/* Selected text (quote) */}
              {getAnnotationSelectedText(annotation) && (
                <div
                  className="p-2 rounded mb-2 text-sm italic"
                  style={{
                    background: 'rgba(14, 165, 233, 0.1)',
                    borderLeft: '3px solid var(--primary)',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  "{getAnnotationSelectedText(annotation)}"
                </div>
              )}

              {/* Annotation content (user's note) */}
              {annotation.content && (
                <p
                  className="text-sm whitespace-pre-wrap text-foreground"
                >
                  {annotation.content}
                </p>
              )}

              {/* Footer */}
              <div
                className="flex items-center justify-between mt-2 pt-2 border-t border-border"
              >
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HugeiconsIcon icon={Clock01Icon} size={12} />
                  {formatAnnotationDate(annotation.created_at)}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(annotation.id)}
                  className="p-2.5 min-h-[44px] min-w-[44px] rounded transition-colors opacity-0 group-hover:opacity-100 hover:bg-muted"
                  style={{ color: 'var(--muted-foreground)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--destructive)';
                    }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--muted-foreground)';
                  }}
                  title="Delete annotation"
                  aria-label="Delete annotation"
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        title={t('ui.delete_confirm', { type: t('viewer.annotation', 'annotation') })}
        message={t('ui.delete_warning')}
        variant="danger"
        confirmLabel={t('ui.delete')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
