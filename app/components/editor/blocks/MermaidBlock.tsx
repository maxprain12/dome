'use client';

import { NodeViewWrapper } from '@tiptap/react';
import { useLayoutEffect, useState, useRef, useId } from 'react';
import mermaid from 'mermaid';
import { Pencil, Trash2 } from 'lucide-react';

interface MermaidBlockProps {
  node: { attrs: { code?: string } };
  updateAttributes: (attrs: { code: string }) => void;
  deleteNode: () => void;
}

function getMermaidTheme(): 'default' | 'dark' {
  if (typeof document === 'undefined') return 'default';
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'dark' ? 'dark' : 'default';
}

export function MermaidBlock({ node, updateAttributes, deleteNode }: MermaidBlockProps) {
  const code = node.attrs.code?.trim() ?? '';
  const [editing, setEditing] = useState(() => !code || code === 'graph TD\n  A[Start] --> B[End]');
  const [editValue, setEditValue] = useState(code);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, '-');

  const applyEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed) {
      updateAttributes({ code: trimmed });
      setEditing(false);
      setError(null);
    }
  };

  useLayoutEffect(() => {
    if (editing || !code) return;

    const el = containerRef.current;
    if (!el) return;

    const renderId = `mermaid-${id}`;
    el.innerHTML = '';
    const pre = document.createElement('pre');
    pre.className = 'mermaid';
    pre.id = renderId;
    pre.textContent = code;
    el.appendChild(pre);

    let cancelled = false;

    const run = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: getMermaidTheme(),
          securityLevel: 'loose',
        });

        const { svg: renderedSvg } = await mermaid.render(renderId, code);
        if (!cancelled && el) {
          el.innerHTML = renderedSvg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Error al renderizar el diagrama');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [code, editing, id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(code);
      setEditing(false);
    }
  };

  return (
    <NodeViewWrapper className="mermaid-block-wrapper" data-drag-handle>
      <div
        className="mermaid-block"
        style={{
          margin: '12px 0',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {editing ? (
          <div style={{ padding: '12px' }}>
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={applyEdit}
              onKeyDown={handleKeyDown}
              placeholder="graph TD&#10;  A[Start] --> B[End]"
              aria-label="Mermaid diagram code"
              className="mermaid-textarea"
              style={{
                width: '100%',
                minHeight: '120px',
                padding: '12px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                fontSize: '13px',
                lineHeight: 1.5,
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--primary-text)',
                resize: 'vertical',
              }}
              spellCheck={false}
            />
            {error && (
              <p
                style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: 'var(--error)',
                }}
              >
                {error}
              </p>
            )}
          </div>
        ) : (
          <div
            style={{ position: 'relative', padding: '16px', cursor: 'pointer' }}
            onDoubleClick={() => setEditing(true)}
          >
            {error ? (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--error-bg)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--error)',
                  fontSize: '13px',
                }}
              >
                {error}
                <button
                  onClick={() => setEditing(true)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  Editar
                </button>
              </div>
            ) : (
              <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
            )}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                display: 'flex',
                gap: '4px',
              }}
            >
              <button
                onClick={() => setEditing(true)}
                title="Editar diagrama"
                style={{
                  padding: '6px',
                  backgroundColor: 'var(--bg-hover)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--primary-text)',
                }}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={deleteNode}
                title="Eliminar"
                aria-label="Eliminar nodo"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                style={{
                  padding: '6px',
                  backgroundColor: 'var(--bg-hover)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--error)',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
