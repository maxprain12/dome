'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CodeIcon, Delete02Icon, Download04Icon, FastForwardIcon, File02Icon, GripVerticalIcon, NextIcon, PlayIcon, TerminalIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import CodeCell from './CodeCell';
import MarkdownCell from './MarkdownCell';
import { usePyodide } from '@/lib/notebook/PyodideProvider';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { NotebookContent, NotebookCell, NotebookCodeCell, NotebookMarkdownCell } from '@/types';
import { stableStringHash } from '@/lib/utils/stableStringHash';
import { parseNotebookContent, normalizeImportedNotebook } from '@/lib/notebook/default-notebook';
import { showToast } from '@/lib/store/useToastStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface NotebookEditorProps {
  content: string;
  onChange: (newContent: string) => void;
  editable?: boolean;
  title?: string;
  /** Working directory for Python execution (notebook workspace folder) */
  workingDirectory?: string;
  /** Path to Python virtual environment (venv directory) */
  venvPath?: string;
}

function cellSourceString(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join('') : cell.source;
}

function buildNotebookCellsWithStableKeys(cells: NotebookCell[]): Array<{ cell: NotebookCell; stableKey: string }> {
  const counts = new Map<string, number>();
  return cells.map((cell) => {
    const payload = `${cell.cell_type}:${cellSourceString(cell)}`;
    const h = stableStringHash(payload);
    const ord = (counts.get(h) ?? 0) + 1;
    counts.set(h, ord);
    return { cell, stableKey: `${cell.cell_type}:${h}:${ord}` };
  });
}

function getCodeCellIndices(cells: NotebookCell[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].cell_type === 'code') indices.push(i);
  }
  return indices;
}

const useIPCKernel = typeof window !== 'undefined' && !!window.electron?.notebook;

export default function NotebookEditor({ content, onChange, editable = true, title = 'notebook', workingDirectory, venvPath }: NotebookEditorProps) {
  const { t } = useTranslation();
  const nb = useMemo(() => parseNotebookContent(content), [content]);
  const cellsZipped = useMemo(() => buildNotebookCellsWithStableKeys(nb.cells), [nb.cells]);
  const { runPython } = usePyodide();
  const [selectedCellIndex, setSelectedCellIndex] = useState(0);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [pythonInfo, setPythonInfo] = useState<{ available: boolean; version?: string; path?: string } | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!useIPCKernel || !window.electron?.notebook?.checkPython) return;
    window.electron.notebook.checkPython().then(setPythonInfo);
  }, []);

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
              source: `${t('notebook.code_placeholder')}\n`,
              outputs: [],
              execution_count: null,
              metadata: {},
            } as NotebookCodeCell)
          : ({
              cell_type: 'markdown',
              source: t('notebook.markdown_placeholder'),
              metadata: {},
            } as NotebookMarkdownCell);

      const cells = [...nb.cells];
      cells.splice(afterIndex + 1, 0, newCell);
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
    },
    [nb, onChange, t]
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
          const src = Array.isArray(c.source) ? c.source.join('') : c.source;
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
          const src = Array.isArray(c.source) ? c.source.join('') : c.source;
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
        venvPath,
      });
      updateCell(index, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    },
    [nb.cells, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory, venvPath]
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
      const source = cell?.cell_type === 'code' ? (Array.isArray(cell.source) ? cell.source.join('') : cell.source) : '';
      const result = await runPython(codeToRun, {
        cells: codeCells,
        targetCellIndex: codeCells.length - 1,
        currentCellCode: source,
        cwd: workingDirectory,
        venvPath,
      });
      updateCell(idx, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    }
  }, [nb.cells, selectedCellIndex, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory, venvPath]);

  const handleRunAll = useCallback(async () => {
    const codeIndices = getCodeCellIndices(nb.cells);
    for (const idx of codeIndices) {
      const cell = nb.cells[idx];
      const source = cell?.cell_type === 'code' ? (Array.isArray(cell.source) ? cell.source.join('') : cell.source) : '';
      const codeToRun = getCodeUpTo(idx);
      const codeCells = getCodeCellsUpTo(idx);
      const result = await runPython(codeToRun, {
        cells: codeCells,
        targetCellIndex: codeCells.length - 1,
        currentCellCode: source,
        cwd: workingDirectory,
        venvPath,
      });
      updateCell(idx, {
        outputs: result.outputs,
        execution_count: result.success ? 1 : null,
      } as Partial<NotebookCodeCell>);
    }
  }, [nb.cells, runPython, updateCell, getCodeUpTo, getCodeCellsUpTo, workingDirectory, venvPath]);

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
          showToast('error', result?.error || t('notebook.export_failed'));
        }
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('notebook.export_failed'));
    }
  }, [content, t, title]);

  const handleImport = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const paths = await window.electron.selectFile({
        filters: [
          { name: 'Jupyter Notebook', extensions: ['ipynb'] },
          { name: t('notebook.all_files'), extensions: ['*'] },
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
              showToast('error', t('notebook.import_invalid_notebook'));
            }
          } catch {
            showToast('error', t('notebook.import_invalid_json'));
          }
        } else {
          showToast('error', result?.error || t('notebook.import_failed'));
        }
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('notebook.import_failed'));
    }
  }, [onChange, t]);

  const handleMoveCell = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex || toIndex < 0 || toIndex >= nb.cells.length) return;
      const cells = [...nb.cells];
      const [removed] = cells.splice(fromIndex, 1);
      if (removed === undefined) return;
      cells.splice(toIndex, 0, removed);
      const newNb: NotebookContent = { ...nb, cells };
      onChange(JSON.stringify(newNb));
      setSelectedCellIndex(toIndex);
    },
    [nb, onChange]
  );

  return (
    <div className="notebook-editor flex flex-col gap-8 p-6 pb-24 mx-auto w-full max-w-[900px]">
      {/* Toolbar */}
      <div className="-mx-1 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Button
          type="button"
          onClick={handleRunCell}
          title="Run cell (Shift+Enter)"
          aria-label={t('notebook.run_cell')}
          size="icon"
        >
          <HugeiconsIcon icon={PlayIcon} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleRunAbove}
          title="Run all cells above"
          aria-label={t('notebook.run_above')}
        >
          <HugeiconsIcon icon={NextIcon} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleRunAll}
          title="Run all cells"
          aria-label={t('notebook.run_all')}
        >
          <HugeiconsIcon icon={FastForwardIcon} />
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => handleAddCell('code', -1)}
          aria-label={t('notebook.add_code_cell')}
        >
          <HugeiconsIcon icon={CodeIcon} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => handleAddCell('markdown', -1)}
          aria-label={t('notebook.add_markdown_cell')}
        >
          <HugeiconsIcon icon={File02Icon} />
        </Button>
        <Separator orientation="vertical" className="h-6" />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleExport}
          title="Export as .ipynb"
          aria-label={t('notebook.export_ipynb')}
        >
          <HugeiconsIcon icon={Download04Icon} />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleImport}
          title="Import .ipynb"
          aria-label={t('notebook.import_ipynb')}
        >
          <HugeiconsIcon icon={Upload04Icon} />
        </Button>
        {useIPCKernel && pythonInfo && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Badge
              variant={pythonInfo.available ? 'secondary' : 'destructive'}
              title={pythonInfo.path || t('notebook.python_not_found')}
            >
              <HugeiconsIcon icon={TerminalIcon} />
              {pythonInfo.available ? (
                <span>
                  Python {pythonInfo.version}
                  {venvPath ? ' (venv)' : ''}
                </span>
              ) : (
                <span>{t('notebook.python_unavailable')}</span>
              )}
            </Badge>
          </>
        )}
      </div>

      {/* Cells */}
      {cellsZipped.map(({ cell, stableKey }, idx) => (
        <div
          key={stableKey}
          className={`cell-wrapper flex flex-col gap-2 rounded-xl p-3 ${
            prefersReducedMotion ? '' : 'transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200'
          } ${idx === selectedCellIndex ? 'ring-2 ring-[color-mix(in srgb, var(--primary) 12%, transparent)] ring-offset-2' : ''}`}
          style={{
            background: idx === selectedCellIndex ? 'var(--card)' : 'transparent',
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
            <Button
              type="button"
              variant="outline"
              size="icon"
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
              className="cursor-grab active:cursor-grabbing"
              title={t('notebook.drag_to_reorder')}
              aria-label={t('notebook.drag_to_reorder')}
            >
              <HugeiconsIcon icon={GripVerticalIcon} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleAddCell('code', idx)}
              title={t('notebook.add_cell_below')}
              aria-label={t('notebook.add_cell_below')}
            >
              <HugeiconsIcon icon={CodeIcon} />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => handleAddCell('markdown', idx)}
              title={t('notebook.add_cell_below')}
              aria-label={t('notebook.add_cell_below')}
            >
              <HugeiconsIcon icon={File02Icon} />
            </Button>
            {nb.cells.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDeleteCell(idx)}
                className="text-destructive hover:text-destructive"
                title={t('notebook.delete_cell')}
                aria-label={t('notebook.delete_cell')}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            )}
          </div>
          {/* Cell body: div[role=button] skipped — nested textarea/input inside CodeCell/MarkdownCell. */}
          <div
            role="button"
            tabIndex={0}
            className="flex-1 min-w-0 overflow-visible cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
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
            aria-label={t('notebook.cell_label', { current: idx + 1, total: nb.cells.length })}
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
        <p className="text-sm py-8 text-muted-foreground">
          {t('notebook.empty_notebook')}
        </p>
      )}
    </div>
  );
}
