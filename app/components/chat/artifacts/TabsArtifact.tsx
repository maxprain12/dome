import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { TabsArtifactV, TabContent } from '@/lib/chat/artifactSchemas';

function TabInner({ content }: { content: TabContent }) {
  switch (content.type) {
    case 'text':
      return (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--primary-text)', whiteSpace: 'pre-wrap' }}>
          {content.text}
        </p>
      );
    case 'code':
      return (
        <pre
          style={{
            fontSize: 12,
            overflowX: 'auto',
            padding: '10px 12px',
            borderRadius: 6,
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--primary-text)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          <code>{content.code}</code>
        </pre>
      );
    case 'list': {
      const ListTag = content.ordered ? 'ol' : 'ul';
      return (
        <ListTag
          style={{
            paddingLeft: 20,
            margin: 0,
            listStyleType: content.ordered ? 'decimal' : 'disc',
            color: 'var(--primary-text)',
            fontSize: 13,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {content.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ListTag>
      );
    }
    case 'table':
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {content.headers.map((header, idx) => (
                  <th
                    key={idx}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontWeight: 600,
                      borderBottom: '2px solid var(--border)',
                      backgroundColor: 'var(--bg-hover)',
                      color: 'var(--primary-text)',
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      style={{
                        padding: '5px 10px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--secondary-text)',
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'placeholder':
      return (
        <p style={{ fontSize: 12, color: 'var(--secondary-text)', margin: 0 }}>{content.message}</p>
      );
    default:
      return null;
  }
}

export default function TabsArtifact({ artifact }: { artifact: TabsArtifactV }) {
  const [active, setActive] = useState(artifact.tabs[0]?.id ?? '');
  const baseId = useId().replace(/[:]/g, '');
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const tabs = artifact.tabs;
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  const focusTab = useCallback((id: string) => {
    const btn = buttonRefs.current[id];
    if (btn) btn.focus();
  }, []);

  const onKeyDown = useCallback(
    (ev: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
      if (tabIds.length === 0) return;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const delta = ev.key === 'ArrowRight' ? 1 : -1;
        const next = tabIds[(idx + delta + tabIds.length) % tabIds.length];
        setActive(next);
        focusTab(next);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        const first = tabIds[0];
        setActive(first);
        focusTab(first);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        const last = tabIds[tabIds.length - 1];
        setActive(last);
        focusTab(last);
      }
    },
    [tabIds, focusTab],
  );

  if (!current) return null;

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div role="tablist" aria-label={artifact.title ?? 'Tabs'} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tabs.map((tab, idx) => {
          const on = tab.id === current.id;
          const tabId = `${baseId}-tab-${tab.id}`;
          const panelId = `${baseId}-panel-${tab.id}`;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttonRefs.current[tab.id] = el;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(ev) => onKeyDown(ev, idx)}
              style={{
                padding: '6px 10px',
                borderRadius: 'var(--radius-full)',
                border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: on
                  ? 'color-mix(in oklab, var(--accent) 14%, transparent)'
                  : 'transparent',
                color: on ? 'var(--accent)' : 'var(--secondary-text)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition:
                  'background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
              }}
            >
              {tab.label}
              {tab.badge && (
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`${baseId}-panel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${current.id}`}
        style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}
      >
        <TabInner content={current.content} />
      </div>
    </div>
  );
}
