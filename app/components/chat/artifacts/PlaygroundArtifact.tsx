import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
} from '@hugeicons/core-free-icons';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaygroundArtifactV } from '@/lib/chat/artifactSchemas';
import './playground-artifact.css';

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
              background: 'var(--muted)',
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
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)' }}
              >
                {i + 1}. {ex.title || ex.id}
              </span>
              {ex.tags && ex.tags.length > 0 && (
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {ex.tags.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: 12,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent)',
                        color: 'var(--muted-foreground)',
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
                color: 'var(--foreground)',
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
                  className="playground-toggle-btn is-hint"
                >
                  {hintOpen ? (
                    <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5" aria-hidden />
                  ) : (
                    <HugeiconsIcon icon={ChevronRightIcon} className="size-3.5" aria-hidden />
                  )}
                  {t('chat.playground_hint')}
                </button>
                {hintOpen && (
                  <p
                    id={hintPanelId}
                    style={{
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
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
                  className="playground-toggle-btn is-solution"
                >
                  {solOpen ? (
                    <HugeiconsIcon icon={ChevronDownIcon} className="size-3.5" aria-hidden />
                  ) : (
                    <HugeiconsIcon icon={ChevronRightIcon} className="size-3.5" aria-hidden />
                  )}
                  {t('chat.playground_solution')}
                </button>
                {solOpen && (
                  <pre
                    id={solPanelId}
                    className="playground-solution-pre"
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
