import type { NotebookContent } from '@/types';

export const DEFAULT_NOTEBOOK: NotebookContent = {
  nbformat: 4,
  nbformat_minor: 1,
  cells: [
    {
      cell_type: 'markdown',
      source: '# Python Notebook\n\nEscribe y ejecuta código Python. Usa **Shift+Enter** para ejecutar una celda.',
      metadata: {},
    },
    {
      cell_type: 'code',
      source: 'print("Hello from Python!")',
      outputs: [],
      execution_count: null,
      metadata: {},
    },
  ],
  metadata: {
    kernelspec: {
      display_name: 'Python 3 (Pyodide)',
      name: 'python3',
      language: 'python',
    },
  },
};

export function parseNotebookContent(content: string | undefined): NotebookContent {
  if (!content || !content.trim()) {
    return { ...DEFAULT_NOTEBOOK };
  }
  try {
    const parsed = JSON.parse(content) as NotebookContent;
    if (parsed.nbformat && Array.isArray(parsed.cells)) {
      return parsed;
    }
  } catch {
    // Invalid JSON, return default
  }
  return { ...DEFAULT_NOTEBOOK };
}

export function serializeNotebookContent(nb: NotebookContent): string {
  return JSON.stringify(nb, null, 0);
}

/** Normaliza una celda importada (nbformat 3 usaba "input" en lugar de "source") */
function normalizeCell(raw: Record<string, unknown>): Record<string, unknown> {
  const cell = { ...raw };
  if (!('source' in cell) && 'input' in cell) {
    cell.source = cell.input;
  }
  if (!cell.source) cell.source = '';
  const type = cell.cell_type as string;
  if (type !== 'markdown' && type !== 'code' && type !== 'raw') {
    cell.cell_type = 'code';
  }
  if (cell.cell_type === 'code') {
    if (!Array.isArray(cell.outputs)) cell.outputs = [];
    if (cell.execution_count === undefined) cell.execution_count = null;
  }
  if (!cell.metadata || typeof cell.metadata !== 'object') cell.metadata = {};
  return cell;
}

/** Normaliza JSON importado a NotebookContent (soporta nbformat 3 y 4) */
export function normalizeImportedNotebook(parsed: unknown): NotebookContent | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  let rawCells: unknown[] | undefined;

  if (Array.isArray(obj.cells)) {
    rawCells = obj.cells;
  } else if (Array.isArray(obj.worksheets) && obj.worksheets.length > 0) {
    const ws = obj.worksheets[0] as Record<string, unknown>;
    rawCells = Array.isArray(ws?.cells) ? ws.cells : undefined;
  }

  if (!rawCells || rawCells.length === 0) return null;

  const cells = rawCells
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object')
    .map(normalizeCell);

  const nbformat = typeof obj.nbformat === 'number' ? obj.nbformat : 4;
  const nbformat_minor = typeof obj.nbformat_minor === 'number' ? obj.nbformat_minor : 1;
  const metadata = obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {};

  return {
    nbformat,
    nbformat_minor,
    cells: cells as NotebookContent['cells'],
    metadata: metadata as NotebookContent['metadata'],
  };
}
