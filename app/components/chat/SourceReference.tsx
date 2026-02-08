'use client';

interface SourceRef {
  number: number;
  id: string;
  title: string;
  type: string;
}

interface SourceReferenceProps {
  sources: SourceRef[];
  onClickSource?: (sourceId: string) => void;
}

export default function SourceReference({ sources, onClickSource }: SourceReferenceProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div
      className="mt-3 pt-3"
      style={{
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tertiary-text)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Sources
      </div>
      <div className="flex flex-col gap-1">
        {sources.map((source) => (
          <button
            key={source.number}
            onClick={() => onClickSource?.(source.id)}
            className="flex items-center gap-2 text-left rounded-md px-2 py-1.5 transition-colors"
            style={{
              fontSize: '12px',
              color: 'var(--secondary-text)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
            onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span
              className="citation-badge"
              style={{
                flexShrink: 0,
              }}
            >
              {source.number}
            </span>
            <span className="truncate">{source.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
