const CREDENTIAL_PLACEHOLDER = /\{\{credential:[0-9a-f-]{36}(?::(?:username|secret))?\}\}/gi;
const SHORT = 60;

export interface ActionSummary {
  /** `manys.actionSummary.<key>` */
  key: 'navigate' | 'click' | 'type' | 'key' | 'scroll' | 'exec' | 'writeFile' | 'createNote';
  values: Record<string, string>;
}

const short = (value: unknown): string => {
  const text = (typeof value === 'string' ? value : JSON.stringify(value ?? '')).replace(/\s+/g, ' ').trim();
  return text.length > SHORT ? `${text.slice(0, SHORT)}…` : text;
};

/** A page address without its scheme, query or fragment: what the person needs to recognise the site. */
function target(value: unknown): string {
  try {
    const url = new URL(String(value));
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return short(value);
  }
}

/**
 * One sentence for what a proposal does, so the person decides without reading JSON. Provider wraps a
 * computer operation as `{ tool: 'computer', parameters: { operation, parameters } }`. Anything it does
 * not recognise returns null and the card falls back to the capability.
 */
export function describeAction(proposal: unknown, savedCredential: string): ActionSummary | null {
  if (!proposal || typeof proposal !== 'object') return null;
  const { tool, parameters } = proposal as { tool?: unknown; parameters?: { operation?: unknown; parameters?: Record<string, unknown> } & Record<string, unknown> };
  if (tool === 'vault' && parameters?.operation === 'create') return { key: 'createNote', values: { title: short(parameters.title) } };
  if (tool !== 'computer' || !parameters || typeof parameters.operation !== 'string') return null;
  // Older proposals were stored flattened ({ operation, url }); newer ones nest the arguments.
  const { operation: _operation, parameters: nested, ...flat } = parameters;
  const args = (nested && typeof nested === 'object' ? nested : flat) as Record<string, unknown>;
  switch (parameters.operation) {
    case 'navigate': return { key: 'navigate', values: { target: target(args.url) } };
    case 'click': return { key: 'click', values: {} };
    case 'type': return { key: 'type', values: { text: short(String(args.text ?? '').replace(CREDENTIAL_PLACEHOLDER, savedCredential)) } };
    case 'key': return { key: 'key', values: { key: short(args.key) } };
    case 'scroll': return { key: 'scroll', values: {} };
    case 'exec': return { key: 'exec', values: { command: short(args.command) } };
    case 'files/write': return { key: 'writeFile', values: { path: short(args.path) } };
    default: return null;
  }
}
