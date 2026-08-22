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
        color: 'var(--muted-foreground)',
        padding: '6px 8px',
        marginTop: 4,
        fontStyle: 'italic',
      }}
    >
      … {count} nodos omitidos — resultado truncado
    </div>
  );
}

function JsonPrettyEllipsis() {
  return <span className="text-muted-foreground">…</span>;
}

function RootOmittedNotice({
  showOmittedNotice,
  depth,
  omitted,
}: {
  showOmittedNotice: boolean;
  depth: number;
  omitted: number;
}) {
  if (!showOmittedNotice || depth !== 0) return null;
  return <OmittedNodesNotice count={omitted} />;
}

function JsonPrettyBudgetExceeded({
  showOmittedNotice,
  depth,
  omitted,
}: {
  showOmittedNotice: boolean;
  depth: number;
  omitted: number;
}) {
  if (showOmittedNotice && depth === 0) {
    return <OmittedNodesNotice count={omitted} />;
  }
  return <JsonPrettyEllipsis />;
}

function stripeBackground(index: number): string {
  return index % 2 === 0
    ? 'transparent'
    : 'color-mix(in srgb, var(--accent) 50%, transparent)';
}

function renderJsonPrettyScalar(value: unknown): ReactNode | undefined {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === 'boolean') {
    return <span className="text-[var(--warning)]">{String(value)}</span>;
  }
  if (typeof value === 'number') {
    return <span className="text-[var(--success)]">{value}</span>;
  }
  if (typeof value === 'string') {
    const display = value.length > 240 ? `${value.slice(0, 237)}…` : value;
    return <span className="text-muted-foreground">"{display}"</span>;
  }
  return undefined;
}

function JsonPrettyArrayView({
  value,
  depth,
  showOmittedNotice,
  omitted,
}: {
  value: unknown[];
  depth: number;
  showOmittedNotice: boolean;
  omitted: number;
}) {
  if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
  return (
    <span>
      {'[\u200B'}
      <span style={{ paddingLeft: 16 * (depth + 1) }}>
        {value.map((item, i) => (
          <div
            key={i}
            style={{
              paddingLeft: 16,
              background: stripeBackground(i),
            }}
          >
            <JsonPrettyPrinter value={item} depth={depth + 1} showOmittedNotice={false} />
            {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
      </span>
      {']'}
      <RootOmittedNotice
        showOmittedNotice={showOmittedNotice}
        depth={depth}
        omitted={omitted}
      />
    </span>
  );
}

function JsonPrettyObjectView({
  value,
  depth,
  showOmittedNotice,
  omitted,
}: {
  value: Record<string, unknown>;
  depth: number;
  showOmittedNotice: boolean;
  omitted: number;
}) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="text-muted-foreground">{'{}'}</span>;
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
            background: stripeBackground(i),
          }}
        >
          <span style={{ color: 'var(--primary)', fontWeight: 500, flexShrink: 0 }}>{k}:</span>
          <span style={{ wordBreak: 'break-word', minWidth: 0 }}>
            <JsonPrettyPrinter value={v} depth={depth + 1} showOmittedNotice={false} />
          </span>
        </div>
      ))}
      <RootOmittedNotice
        showOmittedNotice={showOmittedNotice}
        depth={depth}
        omitted={omitted}
      />
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
    return <JsonPrettyEllipsis />;
  }

  if (budget.nodes >= JSON_PRETTY_MAX_NODES) {
    budget.omitted += 1;
    return (
      <JsonPrettyBudgetExceeded
        showOmittedNotice={showOmittedNotice}
        depth={depth}
        omitted={budget.omitted}
      />
    );
  }

  budget.nodes += 1;

  const scalar = renderJsonPrettyScalar(value);
  if (scalar !== undefined) return scalar;

  if (Array.isArray(value)) {
    return (
      <JsonPrettyArrayView
        value={value}
        depth={depth}
        showOmittedNotice={showOmittedNotice}
        omitted={budget.omitted}
      />
    );
  }

  if (typeof value === 'object') {
    return (
      <JsonPrettyObjectView
        value={value as Record<string, unknown>}
        depth={depth}
        showOmittedNotice={showOmittedNotice}
        omitted={budget.omitted}
      />
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
