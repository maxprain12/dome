
import { FileText, Bookmark, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useManyStore } from '@/lib/store/useManyStore';
import './source-reference.css';

interface SourceRef {
  number: number;
  id: string;
  title: string;
  type: string;
  pageLabel?: string;
  nodeTitle?: string;
}

interface SourceReferenceProps {
  sources: SourceRef[];
  onClickSource?: (source: SourceRef) => void;
}

export default function SourceReference({ sources, onClickSource }: SourceReferenceProps) {
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();
  const pinnedIds = new Set(pinnedResources.map((r) => r.id));

  if (!sources || sources.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--tertiary-text)',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        Sources
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {sources.map((source) => {
          const isPinned = pinnedIds.has(source.id);
          return (
            <div key={source.number} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => onClickSource?.(source)}
                className="source-ref-btn"
                title={[source.title, source.pageLabel, source.nodeTitle].filter(Boolean).join(' · ')}
              >
                <span className="source-ref-number">
                  {source.number}
                </span>
                <FileText style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--tertiary-text)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, display: 'block' }}>
                    {source.title}
                  </span>
                  {source.nodeTitle && (
                    <span className="source-ref-node-title">
                      {source.nodeTitle}
                    </span>
                  )}
                </span>
                {source.pageLabel ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
                    <Bookmark style={{ width: 10, height: 10 }} />
                    {source.pageLabel.replace(/^págs?\.\s*/i, 'p. ')}
                  </span>
                ) : null}
              </button>

              {/* Add-to-context button */}
              {source.id && (
                <button
                  type="button"
                  onClick={() => {
                    if (isPinned) {
                      removePinnedResource(source.id);
                    } else {
                      addPinnedResource({ id: source.id, title: source.title, type: source.type });
                    }
                  }}
                  title={isPinned ? 'Quitar del contexto' : 'Añadir al contexto del chat'}
                  className={`source-ref-pin-btn ${isPinned ? 'is-pinned' : 'is-unpinned'}`}
                >
                  {isPinned
                    ? <CheckCircle2 style={{ width: 13, height: 13 }} />
                    : <PlusCircle style={{ width: 13, height: 13 }} />
                  }
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
