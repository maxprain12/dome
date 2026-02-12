'use client';

import { useCallback, useState } from 'react';
import { Play, SkipForward, FastForward, Download, Upload, X, Code2, FileText, GripVertical, Trash2 } from 'lucide-react';
import CodeCell from './CodeCell';
import MarkdownCell from './MarkdownCell';
import { usePyodide } from '@/lib/notebook/PyodideProvider';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { NotebookContent, NotebookCell, NotebookCodeCell, NotebookMarkdownCell } from '@/types';
import { parseNotebookContent, normalizeImportedNotebook } from '@/lib/notebook/default-notebook';

interface NotebookEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  editable?: boolean;
  title?: string;
  /** Working directory for Python execution (notebook workspace folder) */
  workingDirectory?: string;
}

function getCodeCellIndices(cells: NotebookCell[]): number[] {
  return cells
    .map((c, i) => (c.cell_type === 'code' ? i : -1))
    .filter((i) => i >= 0);
}

export default function NotebookEditor({ content, onChange, editable = true, title = 'notebook', workingDirectory }: NotebookEditorProps) {
  const nb = parseNotebookContent(content);
  const { runPython } = usePyodide();
  const [selectedCellIndex, setSelectedCellIndex] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const updateCell = useCallback(
    (index: number, updates: Partial<NotebookCell>) => {
      const cells = [...nb.cells];
      const cell = cells[index];
      if (!cell) return;
      const updated = { ...cell, ...updates } as NotebookCell;
      cells[index] = updated;
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
    },
    [nb, onChange]
  );

  const handleAddCell = useCallback(
    (type: 'code' | 'markdown', afterIndex: number) => {
      const newCell: NotebookCell =
        type === 'code'
          ? ({
              cell_type: 'code',
              source: '# Escribe código aquí\n',
              outputs: [],
              execution_count: null,
              metadata: {},
            } as NotebookCodeCell)
          : ({
              cell_type: 'markdown',
              source: 'Escribe markdown aquí...',
              metadata: {},
            } as NotebookMarkdownCell);

      const cells = [...nb.cells];
      cells.splice(afterIndex + 1, 0, newCell);
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
    },
    [nb, onChange]
  );

  const handleDeleteCell = useCallback(
    (index: number) => {
      const cells = nb.cells.filter((_, i) => i !== index);
      if (cells.length === 0) return;
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
    },
    [nb, onChange]
  );

  /** Gather code from code cells 0..index (inclusive) so imports and variables persist */
  const getCodeUpTo = useCallback(
    (endIndex: number): string => {
      const parts: string[] = [];
      for (let i = 0; i <= endIndex; i++) {
        const c = nb.cells[i];
        if (c?.cell_type === 'code') {
          const src = typeof c.source === 'string' ? c.source : c.source.join('');
          if (src.trim()) parts.push(src);
        }
      }
      return parts.join('\n\n');
    },
    [nb.cells]
  );

  /** Get array of code cell sources for indices 0..endIndex (only code cells) */
  const getCodeCellsUpTo = useCallback(
    (endIndex: number): string[] => {
      const cells: string[] = [];
      for (let i = 0; i <= endIndex; i++) {
        const c = nb.cells[i];
        if (c?.cell_type === 'code') {
          const src = typeof c.source === 'string' ? c.source : c.source.join('');
          cells.push(src);
        }
      }
      return cells;
    },
    [nb.cells]
  );

  const runCellAtIndex = useCallback(
    async (index: number) => {
      const cell = nb.cells[index];
      if (!cell || cell.cell_type !== 'code') return;
      const source = typeof cell.source === 'string' ? cell.source : cell.source.join('');
      if (!source.trim()) return;

      const codeToRun = getCodeUpTo(index);
      const codeCells = getCodeCellsUpTo(index);
      const targetCellIndex = codeCells.length - 1;
      const result = await runPython(codeToRun, {
        cells: codeCells,
        targetCellIndex,
        currentCellCode: source, // For Pyodide (stateful kernel): run only this cell
        cwd: workingDirectory,
      });
      updateCell(index, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    },
    [nb.cells, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory]
  );

  const handleRunCell = useCallback(() => {
    const cell = nb.cells[selectedCellIndex];
    if (cell?.cell_type === 'code') runCellAtIndex(selectedCellIndex);
  }, [nb.cells, selectedCellIndex, runCellAtIndex]);

  const handleRunAbove = useCallback(async () => {
    const codeIndices = getCodeCellIndices(nb.cells);
    const toRun = codeIndices.filter((i) => i < selectedCellIndex);
    for (const idx of toRun) {
      const codeToRun = getCodeUpTo(idx);
      const codeCells = getCodeCellsUpTo(idx);
      const cell = nb.cells[idx];
      const source = cell?.cell_type === 'code' ? (typeof cell.source === 'string' ? cell.source : (cell as NotebookCodeCell).source.join('')) : '';
      const result = await runPython(codeToRun, {
        cells: codeCells,
        targetCellIndex: codeCells.length - 1,
        currentCellCode: source,
        cwd: workingDirectory,
      });
      updateCell(idx, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    }
  }, [nb.cells, selectedCellIndex, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory]);

  const handleRunAll = useCallback(async () => {
    const codeIndices = getCodeCellIndices(nb.cells);
    for (const idx of codeIndices) {
      const cell = nb.cells[idx];
      const source = cell?.cell_type === 'code' ? (typeof cell.source === 'string' ? cell.source : (cell as NotebookCodeCell).source.join('')) : '';
      const codeToRun = getCodeUpTo(idx);
      const codeCells = getCodeCellsUpTo(idx);
      const result = await runPython(codeToRun, {
        cells: codeCells,
        targetCellIndex: codeCells.length - 1,
        currentCellCode: source,
        cwd: workingDirectory,
      });
      updateCell(idx, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    }
  }, [nb.cells, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory]);

  const handleExport = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const filePath = await window.electron.showSaveDialog({
        defaultPath: `${title || 'notebook'}.ipynb`,
        filters: [{ name: 'Jupyter Notebook', extensions: ['ipynb'] }],
      });
      if (filePath) {
        const result = await window.electron.file.writeFile(filePath, content);
        if (!result?.success) {
          console.error('Export failed:', result?.error);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [content, title]);

  const handleImport = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const paths = await window.electron.selectFile({
        filters: [
          { name: 'Jupyter Notebook', extensions: ['ipynb'] },
          { name: 'Todos los archivos', extensions: ['*'] },
        ],
      });
      if (paths?.length && paths[0]) {
        const result = await window.electron.file.readFileAsText(paths[0]);
        if (result?.success && result.data) {
          try {
            const parsed = JSON.parse(result.data);
            const normalized = normalizeImportedNotebook(parsed);
            if (normalized) {
              onChange(JSON.stringify(normalized));
            } else {
              console.warn('Import: el archivo no tiene formato de notebook válido (cells)');
            }
          } catch {
            console.warn('Import: el archivo no es un JSON de notebook válido');
          }
        } else {
          console.warn('Import failed:', result?.error);
        }
      }
    } catch (err) {
      console.error('Import failed:', err);
    }
  }, [onChange]);

  const handleMoveCell = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= nb.cells.length) return;
      const cells = [...nb.cells];
      const [removed] = cells.splice(fromIndex, 1);
      cells.splice(toIndex, 0, removed);
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
      setSelectedCellIndex(toIndex);
    },
    [nb, onChange]
  );

  const btnSecondary =
    'px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--primary-text)] hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2';
  const btnPrimary =
    'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 cursor-pointer transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 shadow-sm';

  return (
    <div className="notebook-editor flex flex-col gap-8 p-6 pb-24 mx-auto w-full max-w-[900px]">
      {/* Toolbar */}
      <div
        className="flex gap-2 flex-wrap items-center p-3 rounded-xl -mx-1"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <button
          type="button"
          onClick={handleRunCell}
          className={btnPrimary}
          style={{ background: 'var(--accent)', color: 'white' }}
          title="Run cell (Shift+Enter)"
          aria-label="Ejecutar celda actual"
        >
          <Play size={14} />
          Run cell
        </button>
        <button
          type="button"
          onClick={handleRunAbove}
          className={btnSecondary}
          title="Run all cells above"
          aria-label="Ejecutar celdas superiores"
        >
          <SkipForward size={14} />
          Run above
        </button>
        <button
          type="button"
          onClick={handleRunAll}
          className={btnSecondary}
          title="Run all cells"
          aria-label="Ejecutar todas las celdas"
        >
          <FastForward size={14} />
          Run all
        </button>
        <span className="w-px h-6 bg-[var(--border)] self-stretch" aria-hidden />
        <button
          type="button"
          onClick={() => handleAddCell('code', -1)}
          className={btnSecondary}
          aria-label="Añadir celda de código"
        >
          + Code
        </button>
        <button
          type="button"
          onClick={() => handleAddCell('markdown', -1)}
          className={btnSecondary}
          aria-label="Añadir celda markdown"
        >
          + Markdown
        </button>
        <span className="w-px h-6 bg-[var(--border)] self-stretch" aria-hidden />
        <button
          type="button"
          onClick={handleExport}
          className={btnSecondary}
          title="Export as .ipynb"
          aria-label="Exportar como archivo ipynb"
        >
          <Download size={14} />
          Export
        </button>
        <button
          type="button"
          onClick={handleImport}
          className={btnSecondary}
          title="Import .ipynb"
          aria-label="Importar archivo ipynb"
        >
          <Upload size={14} />
          Import
        </button>
      </div>

      {/* Cells */}
      {nb.cells.map((cell, idx) => (
        <div
          key={idx}
          className={`cell-wrapper flex flex-col gap-2 rounded-xl p-3 ${
            prefersReducedMotion ? '' : 'transition-all duration-200'
          } ${idx === selectedCellIndex ? 'ring-2 ring-[var(--translucent)] ring-offset-2' : ''}`}
          style={{
            background: idx === selectedCellIndex ? 'var(--bg-secondary)' : 'transparent',
            border: idx === selectedCellIndex ? '1px solid var(--border)' : '1px solid transparent',
            boxShadow: idx === selectedCellIndex ? 'var(--shadow-sm)' : undefined,
            opacity: !prefersReducedMotion && draggingIndex === idx ? 0.5 : 1,
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!Number.isNaN(from) && from !== idx) {
              handleMoveCell(from, idx);
            }
          }}
        >
          <div className="cell-actions flex flex-row items-center gap-1 shrink-0">
            {/* Drag handle - mantén pulsado y arrastra para mover la celda */}
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', String(idx));
                e.dataTransfer.effectAllowed = 'move';
                setDraggingIndex(idx);
                const wrapper = (e.currentTarget as HTMLElement).closest('.cell-wrapper');
                if (wrapper) {
                  e.dataTransfer.setDragImage(wrapper as HTMLElement, 0, 0);
                }
              }}
              onDragEnd={() => setDraggingIndex(null)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' && idx > 0) {
                  e.preventDefault();
                  handleMoveCell(idx, idx - 1);
                } else if (e.key === 'ArrowDown' && idx < nb.cells.length - 1) {
                  e.preventDefault();
                  handleMoveCell(idx, idx + 1);
                }
              }}
              className={`flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-grab active:cursor-grabbing select-none shrink-0 ${
                prefersReducedMotion ? '' : 'hover:bg-[var(--bg-hover)]'
              }`}
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--tertiary-text)',
              }}
              title="Mantén pulsado para arrastrar y mover la celda"
              aria-label="Arrastrar para reordenar celda"
            >
              <GripVertical size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleAddCell('code', idx)}
              className="flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)]"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--accent)',
              }}
              title="Añadir celda de código debajo"
              aria-label="Añadir celda de código debajo"
            >
              <Code2 size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleAddCell('markdown', idx)}
              className="flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)]"
              style={{
                background: 'var(--bg-secondary)',
                borderColor: 'var(--border)',
                color: 'var(--accent)',
              }}
              title="Añadir celda markdown debajo"
              aria-label="Añadir celda markdown debajo"
            >
              <FileText size={18} />
            </button>
            {nb.cells.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteCell(idx)}
                className="flex items-center justify-center w-9 h-9 rounded-md border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer hover:bg-[var(--error-bg)] hover:border-[var(--error)]"
                style={{
                  background: 'var(--bg-secondary)',
                  borderColor: 'var(--border)',
                  color: 'var(--error)',
                }}
                title="Eliminar celda"
                aria-label="Eliminar celda"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <div
            role="button"
            tabIndex={0}
            className="flex-1 min-w-0 overflow-visible cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-lg"
            onClick={() => setSelectedCellIndex(idx)}
            onKeyDown={(e) => {
              // Don't capture Enter/Space when typing in textarea/input - let them handle it (newline, space)
              const target = e.target as HTMLElement;
              if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable) {
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSelectedCellIndex(idx);
              }
            }}
            aria-label={`Celda ${idx + 1} de ${nb.cells.length}`}
          >
            {cell.cell_type === 'code' ? (
              <CodeCell
                cell={cell as NotebookCodeCell}
                onChange={(source) => updateCell(idx, { source })}
                onOutputsChange={(outputs) => updateCell(idx, { outputs } as Partial<NotebookCodeCell>)}
                onExecutionCountChange={(execution_count) =>
                  updateCell(idx, { execution_count } as Partial<NotebookCodeCell>)
                }
                editable={editable}
                cellIndex={idx}
                onRun={() => runCellAtIndex(idx)}
              />
            ) : (
              <MarkdownCell
                source={(cell as NotebookMarkdownCell).source}
                onChange={editable ? (source) => updateCell(idx, { source }) : undefined}
                editable={editable}
              />
            )}
          </div>
        </div>
      ))}

      {nb.cells.length === 0 && (
        <p className="text-sm py-8" style={{ color: 'var(--tertiary)' }}>
          No hay celdas. Añade una celda de código o markdown para empezar.
        </p>
      )}
    </div>
  );
}
