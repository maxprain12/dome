
import { FileText, Bookmark, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useManyStore } from '@/lib/store/useManyStore';

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
          fontSize: 10,
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
                onClick={() => onClickSource?.(source)}
                style={{
                  display: 'flex',
                  maxWidth: '100%',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'left',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  color: 'var(--secondary-text)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 150ms ease, border-color 150ms ease',
                }}
                onMouseOver={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'var(--bg-hover)';
                  el.style.borderColor = 'var(--border-hover)';
                }}
                onMouseOut={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.background = 'var(--bg-secondary)';
                  el.style.borderColor = 'var(--border)';
                }}
                title={[source.title, source.pageLabel, source.nodeTitle].filter(Boolean).join(' · ')}
              >
                <span
                  style={{
                    flexShrink: 0,
                    background: 'var(--accent)',
                    color: 'var(--base-text)',
                    borderRadius: 4,
                    padding: '1px 5px',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: 1.4,
                  }}
                >
                  {source.number}
                </span>
                <FileText style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--tertiary-text)' }} />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, display: 'block' }}>
                    {source.title}
                  </span>
                  {source.nodeTitle && (
                    <span style={{ fontSize: 10, color: 'var(--tertiary-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, display: 'block', marginTop: 1 }}>
                      {source.nodeTitle}
                    </span>
                  )}
                </span>
                {source.pageLabel ? (
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>
                    <Bookmark style={{ width: 10, height: 10 }} />
                    {source.pageLabel.replace(/^págs?\.\s*/i, 'p. ')}
                  </span>
                ) : null}
              </button>

              {/* Add-to-context button */}
              {source.id && (
                <button
                  onClick={() => {
                    if (isPinned) {
                      removePinnedResource(source.id);
                    } else {
                      addPinnedResource({ id: source.id, title: source.title, type: source.type });
                    }
                  }}
                  title={isPinned ? 'Quitar del contexto' : 'Añadir al contexto del chat'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    border: '1px solid var(--border)',
                    background: isPinned ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-secondary)',
                    color: isPinned ? 'var(--accent)' : 'var(--tertiary-text)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'all 150ms ease',
                  }}
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
