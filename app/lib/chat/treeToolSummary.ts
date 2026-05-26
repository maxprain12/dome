function normalizeToolName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function countTreeNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const record = node as Record<string, unknown>;
  let count = 1;
  const children = record.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      count += countTreeNodes(child);
    }
  }
  return count;
}

export function isFilesystemTreeTool(name: string): boolean {
  const n = normalizeToolName(name);
  return n === 'directory_tree' || n === 'file_tree';
}

export type TreeToolSummary = {
  path?: string;
  shown?: number;
  truncated?: boolean;
  max_depth?: number;
  maxDepth?: number;
  entry_count?: number;
  node_count?: number;
};

export function parseTreeToolSummary(result: unknown): TreeToolSummary | null {
  let parsed: Record<string, unknown> | null = null;
  if (result && typeof result === 'object') {
    parsed = result as Record<string, unknown>;
  } else if (typeof result === 'string') {
    try {
      const obj = JSON.parse(result) as unknown;
      if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (!parsed) return null;

  const path =
    typeof parsed.path === 'string'
      ? parsed.path
      : typeof parsed.file_path === 'string'
        ? parsed.file_path
        : undefined;

  const shown =
    typeof parsed.shown === 'number'
      ? parsed.shown
      : typeof parsed.count === 'number'
        ? parsed.count
        : undefined;

  const truncated = parsed.truncated === true;
  const maxDepth =
    typeof parsed.max_depth === 'number'
      ? parsed.max_depth
      : typeof parsed.maxDepth === 'number'
        ? parsed.maxDepth
        : undefined;

  const tree = parsed.tree ?? parsed.children ?? parsed;
  const nodeCount = countTreeNodes(tree);

  if (!path && shown == null && !truncated && nodeCount <= 1) {
    return null;
  }

  return {
    path,
    shown,
    truncated,
    max_depth: maxDepth,
    node_count: nodeCount > 0 ? nodeCount : undefined,
  };
}
