import type { TimelineArtifactV } from '@/lib/chat/artifactSchemas';

export default function TimelineArtifact({ artifact }: { artifact: TimelineArtifactV }) {
  return (
    <ol
      aria-label={artifact.title ?? 'Timeline'}
      style={{
        padding: 12,
        margin: 0,
        listStyle: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {artifact.events.map((ev) => (
        <li
          key={ev.id}
          aria-label={`${ev.at} — ${ev.title}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '88px 1fr',
            gap: 12,
            padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <time
            style={{
              fontSize: 12,
              color: 'var(--tertiary-text)',
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {ev.at}
          </time>
          <div>
            <div
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary-text)' }}
            >
              {ev.title}
            </div>
            {ev.status && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--secondary-text)',
                }}
              >
                {ev.status}
              </span>
            )}
            {ev.body && (
              <p
                style={{
                  fontSize: 13,
                  color: 'var(--secondary-text)',
                  margin: '6px 0 0',
                  lineHeight: 1.5,
                }}
              >
                {ev.body}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
