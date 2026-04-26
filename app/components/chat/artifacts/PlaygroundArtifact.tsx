import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PlaygroundArtifactV } from '@/lib/chat/artifactSchemas';

export default function PlaygroundArtifact({ artifact }: { artifact: PlaygroundArtifactV }) {
  const { t } = useTranslation();
  const baseId = useId().replace(/:/g, '');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openSol, setOpenSol] = useState<Record<string, boolean>>({});

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {artifact.exercises.map((ex, i) => {
        const hintOpen = !!open[ex.id];
        const solOpen = !!openSol[ex.id];
        const hintPanelId = `${baseId}-hint-${ex.id}`;
        const solPanelId = `${baseId}-sol-${ex.id}`;
        return (
          <div
            key={ex.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 14px',
              background: 'var(--bg-tertiary)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--secondary-text)' }}
              >
                {i + 1}. {ex.title || ex.id}
              </span>
              {ex.tags && ex.tags.length > 0 && (
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ex.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-hover)',
                        color: 'var(--tertiary-text)',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <p
              style={{
                fontSize: 13,
                color: 'var(--primary-text)',
                margin: '8px 0 0',
                lineHeight: 1.55,
              }}
            >
              {ex.prompt}
            </p>
            {ex.hint && (
              <>
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [ex.id]: !s[ex.id] }))}
                  aria-expanded={hintOpen}
                  aria-controls={hintPanelId}
                  style={{
                    marginTop: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {hintOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {t('chat.playground_hint')}
                </button>
                {hintOpen && (
                  <p
                    id={hintPanelId}
                    style={{
                      fontSize: 12,
                      color: 'var(--secondary-text)',
                      margin: '6px 0 0',
                    }}
                  >
                    {ex.hint}
                  </p>
                )}
              </>
            )}
            {ex.solution && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenSol((s) => ({ ...s, [ex.id]: !s[ex.id] }))}
                  aria-expanded={solOpen}
                  aria-controls={solPanelId}
                  style={{
                    marginTop: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: 'var(--secondary-text)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {solOpen ? (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {t('chat.playground_solution')}
                </button>
                {solOpen && (
                  <pre
                    id={solPanelId}
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      color: 'var(--primary-text)',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      padding: 8,
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    {ex.solution}
                  </pre>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
