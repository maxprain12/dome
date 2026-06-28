import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DashboardArtifactV } from '@/lib/chat/artifactSchemas';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import './dashboard-artifact.css';

const toneColor: Record<string, string> = {
  neutral: 'var(--secondary-text)',
  good: 'var(--success)',
  warn: 'var(--warning)',
  bad: 'var(--error)',
};

function clampPercent(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

const trendArrow: Record<string, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

const trendColor: Record<string, string> = {
  up: 'var(--success)',
  down: 'var(--error)',
  flat: 'var(--secondary-text)',
};

export default function DashboardArtifact({ artifact }: { artifact: DashboardArtifactV }) {
  // Click-to-focus a KPI: highlights it, dims the rest. Click again (or any
  // other KPI) to switch focus. Pure UI state — no callback to parent.
  const [focusedKpi, setFocusedKpi] = useState<string | null>(null);
  // Sections start expanded; user can collapse to skim the dashboard.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div
      style={{
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      {artifact.kpis && artifact.kpis.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(170px, 100%), 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {artifact.kpis.map((k, idx) => {
            const key = k.id ?? `kpi-${idx}`;
            const isLead = idx === 0 && focusedKpi === null;
            const isFocused = focusedKpi === key;
            const isDimmed = focusedKpi !== null && !isFocused;
            const sub = k.sub ?? k.subtitle;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFocusedKpi(isFocused ? null : key)}
                aria-pressed={isFocused}
                className={[
                  'dash-kpi-card',
                  (isFocused || isLead) && 'is-accent',
                  isFocused && 'is-focused',
                  isDimmed && 'is-dimmed',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--secondary-text)',
                  }}
                >
                  {k.label}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 6,
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 700,
                      lineHeight: 1.1,
                      color: isFocused || isLead ? 'var(--accent)' : 'var(--primary-text)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {k.value}
                  </span>
                  {k.unit && (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--secondary-text)',
                      }}
                    >
                      {k.unit}
                    </span>
                  )}
                  {k.trend && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: trendColor[k.trend] ?? 'var(--secondary-text)',
                        marginLeft: 'auto',
                      }}
                      aria-label={`trend ${k.trend}`}
                    >
                      {trendArrow[k.trend]}
                    </span>
                  )}
                </div>
                {sub && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--tertiary-text)',
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {sub}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {artifact.sections && artifact.sections.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {artifact.sections.map((s, idx) => {
            const key = s.id ?? `sec-${idx}`;
            const collapsed = collapsedSections.has(key);
            const bodyId = `dash-section-${key}`;
            return (
              <section key={key} className="dash-section">
                <button
                  type="button"
                  onClick={() => toggleSection(key)}
                  aria-expanded={!collapsed}
                  aria-controls={bodyId}
                  className={`dash-section-toggle ${collapsed ? 'is-collapsed' : ''}`}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 4,
                      height: 14,
                      borderRadius: 2,
                      background: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                  <h4
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--primary-text)',
                      margin: 0,
                      lineHeight: 1.3,
                      flex: 1,
                      textAlign: 'left',
                    }}
                  >
                    {s.title}
                  </h4>
                  <ChevronDown
                    style={{
                      width: 14,
                      height: 14,
                      color: 'var(--secondary-text)',
                      transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 160ms ease',
                      flexShrink: 0,
                    }}
                  />
                </button>
                {!collapsed && (
                  <div
                    id={bodyId}
                    className="dashboard-section-body"
                    style={{
                      fontSize: 12.5,
                      color: 'var(--secondary-text)',
                      lineHeight: 1.55,
                    }}
                  >
                    <MarkdownRenderer content={s.body} />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {(() => {
        const map = artifact.map;
        if (!map) return null;
        return (
        <div>
          <table
            style={{
              width: '100%',
              maxWidth: 'min(100%, 480px)',
              borderCollapse: 'separate',
              borderSpacing: 4,
              tableLayout: 'fixed',
            }}
            role="grid"
            aria-label={artifact.title ?? 'Dashboard map'}
          >
            <tbody>
              {Array.from({ length: map.rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: map.cols }, (_, c) => {
                    const cell = map.cells.find((x) => x.r === r && x.c === c);
                    return (
                      <td
                        key={c}
                        className={`dash-map-cell ${cell ? 'is-filled' : 'is-empty'}`}
                        style={{ color: cell ? toneColor[cell.tone ?? 'neutral'] : undefined }}
                      >
                        {cell?.label ?? '·'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })()}

      {artifact.items && artifact.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {artifact.items.map((it, idx) => {
            const pct = clampPercent(it.progress);
            return (
              <div key={it.id ?? `it-${idx}`}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    marginBottom: 4,
                  }}
                >
                  <span style={{ color: 'var(--primary-text)' }}>{it.label}</span>
                  <span
                    style={{ color: 'var(--tertiary-text)', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {pct}%
                  </span>
                </div>
                <progress
                  value={pct}
                  max={100}
                  aria-label={it.label}
                  className="w-full block"
                  style={{
                    height: 6,
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--bg-hover)',
                    overflow: 'hidden',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
