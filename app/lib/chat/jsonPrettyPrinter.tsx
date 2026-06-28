import { createContext, useContext, useMemo, type ReactNode } from 'react';

export const JSON_PRETTY_MAX_NODES = 200;
export const JSON_PRETTY_MAX_DEPTH = 6;

type Budget = { nodes: number; omitted: number };

const JsonPrettyBudgetContext = createContext<Budget | null>(null);

export function JsonPrettyBudgetProvider({
  children,
  budget,
}: {
  children: ReactNode;
  budget: Budget;
}) {
  return (
    <JsonPrettyBudgetContext.Provider value={budget}>
      {children}
    </JsonPrettyBudgetContext.Provider>
  );
}

function useJsonPrettyBudget(): Budget {
  const ctx = useContext(JsonPrettyBudgetContext);
  if (ctx) return ctx;
  return { nodes: 0, omitted: 0 };
}

function OmittedNodesNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div
      style={{
        fontSize: 12,
        color: 'var(--tertiary-text)',
        padding: '6px 8px',
        marginTop: 4,
        fontStyle: 'italic',
      }}
    >
      … {count} nodos omitidos — resultado truncado
    </div>
  );
}

/**
 * JSON pretty-printer with hard node/depth limits to avoid freezing the chat UI.
 */
export function JsonPrettyPrinter({
  value,
  depth = 0,
  showOmittedNotice = true,
}: {
  value: unknown;
  depth?: number;
  showOmittedNotice?: boolean;
}) {
  const budget = useJsonPrettyBudget();

  if (depth >= JSON_PRETTY_MAX_DEPTH) {
    budget.omitted += 1;
    return <span style={{ color: 'var(--tertiary-text)' }}>…</span>;
  }

  if (budget.nodes >= JSON_PRETTY_MAX_NODES) {
    budget.omitted += 1;
    return showOmittedNotice && depth === 0 ? (
      <OmittedNodesNotice count={budget.omitted} />
    ) : (
      <span style={{ color: 'var(--tertiary-text)' }}>…</span>
    );
  }

  budget.nodes += 1;

  if (value === null) return <span style={{ color: 'var(--tertiary-text)' }}>null</span>;
  if (typeof value === 'boolean') return <span style={{ color: 'var(--warning)' }}>{String(value)}</span>;
  if (typeof value === 'number') return <span style={{ color: 'var(--success)' }}>{value}</span>;
  if (typeof value === 'string') {
    const display = value.length > 240 ? `${value.slice(0, 237)}…` : value;
    return <span style={{ color: 'var(--secondary-text)' }}>"{display}"</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: 'var(--tertiary-text)' }}>[]</span>;
    return (
      <span>
        {'[\u200B'}
        <span style={{ paddingLeft: 16 * (depth + 1) }}>
          {value.map((item, i) => (
            <div
              key={i}
              style={{
                paddingLeft: 16,
                background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-hover) 50%, transparent)',
              }}
            >
              <JsonPrettyPrinter value={item} depth={depth + 1} showOmittedNotice={false} />
              {i < value.length - 1 && <span style={{ color: 'var(--tertiary-text)' }}>,</span>}
            </div>
          ))}
        </span>
        {']'}
        {showOmittedNotice && depth === 0 ? <OmittedNodesNotice count={budget.omitted} /> : null}
      </span>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span style={{ color: 'var(--tertiary-text)' }}>{'{}'}</span>;
    return (
      <div>
        {entries.map(([k, v], i) => (
          <div
            key={k}
            style={{
              display: 'flex',
              gap: 6,
              padding: '2px 6px',
              borderRadius: 3,
              background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--bg-hover) 50%, transparent)',
            }}
          >
            <span style={{ color: 'var(--accent)', fontWeight: 500, flexShrink: 0 }}>{k}:</span>
            <span style={{ wordBreak: 'break-word', minWidth: 0 }}>
              <JsonPrettyPrinter value={v} depth={depth + 1} showOmittedNotice={false} />
            </span>
          </div>
        ))}
        {showOmittedNotice && depth === 0 ? <OmittedNodesNotice count={budget.omitted} /> : null}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

export function JsonPrettyPrinterRoot({ value }: { value: unknown }) {
  const budget = useMemo(() => {
    void value;
    return { nodes: 0, omitted: 0 };
  }, [value]);
  return (
    <JsonPrettyBudgetProvider budget={budget}>
      <JsonPrettyPrinter value={value} depth={0} />
    </JsonPrettyBudgetProvider>
  );
}
