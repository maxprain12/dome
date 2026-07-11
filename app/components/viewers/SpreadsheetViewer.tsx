
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { type Resource } from '@/types';
import LoadingState from '@/components/ui/LoadingState';
import ErrorState from '@/components/ui/ErrorState';

interface SheetData {
  name: string;
  data: string[][];
}

interface SpreadsheetViewerProps {
  resource: Resource;
}

/** Convert column index to Excel letter (0=A, 25=Z, 26=AA) */
function colToLetter(col: number): string {
  let result = '';
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode(65 + (c % 26)) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

/** Expand A1:C3 range to list of uppercase cell addresses */
function expandRange(range: string): string[] {
  const parts = range.toUpperCase().replace(/\$/g, '').split(':');
  if (parts.length !== 2) return [];
  const parseRef = (r: string) => {
    const m = r.match(/^([A-Z]+)(\d+)$/);
    if (!m) return null;
    let col = 0;
    for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
    return { col: col - 1, row: parseInt(m[2], 10) - 1 };
  };
  const a = parseRef(parts[0]);
  const b = parseRef(parts[1]);
  if (!a || !b) return [];
  const refs: string[] = [];
  for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) {
    for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
      refs.push(`${colToLetter(c)}${r + 1}`);
    }
  }
  return refs;
}

/**
 * Evaluate a basic Excel formula against a numeric cell map.
 * Handles: SUM/AVERAGE/COUNT/MIN/MAX, arithmetic (+−×÷), cell refs, ranges.
 */
function evalFormula(formula: string, cellMap: Map<string, number>): string {
  let expr = formula.replace(/^=/, '').trim();

  // Resolve aggregate functions
  expr = expr.replace(
    /\b(SUM|AVERAGE|AVG|COUNT|MIN|MAX)\s*\(([^)]+)\)/gi,
    (_, fn: string, args: string) => {
      const vals: number[] = [];
      for (const arg of args.split(',')) {
        const a = arg.trim().replace(/\$/g, '').toUpperCase();
        const isRange = /:/.test(a);
        const targets = isRange ? expandRange(a) : [a];
        const targetRefs = new Set(targets);
        for (const ref of targetRefs) {
          const v = cellMap.get(ref);
          if (v !== undefined && isFinite(v)) vals.push(v);
        }
      }
      if (!vals.length) return '0';
      switch (fn.toUpperCase()) {
        case 'SUM': return String(vals.reduce((a, b) => a + b, 0));
        case 'AVERAGE':
        case 'AVG': return String(vals.reduce((a, b) => a + b, 0) / vals.length);
        case 'COUNT': return String(vals.length);
        case 'MIN': return String(Math.min(...vals));
        case 'MAX': return String(Math.max(...vals));
        default: return '0';
      }
    },
  );

  // Replace remaining cell references with numeric values
  expr = expr.replace(/\$?[A-Z]+\$?\d+/gi, (ref) => {
    const v = cellMap.get(ref.replace(/\$/g, '').toUpperCase());
    return v !== undefined ? String(v) : '0';
  });

  // Evaluate arithmetic (safe: only numbers + operators + parens remain)
  try {
    if (!/^[\d\s+\-*/().e,]+$/i.test(expr)) return '';
    const val = Function(`"use strict"; return (${expr})`)() as unknown;
    if (typeof val !== 'number' || !isFinite(val)) return '';
    // Round to 10 significant digits to eliminate floating-point noise
    return String(Math.round(val * 1e10) / 1e10);
  } catch {
    return '';
  }
}

/** Parse string to number or boolean for Excel cell value */
function parseCellValue(raw: string): string | number | boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  const num = Number(trimmed);
  if (!Number.isNaN(num) && trimmed !== '') return num;
  return trimmed;
}

/** Return a sheet with the given row patched so `sheet.data[row][col] === String(value)`. */
function applyRowEdit(sheet: SheetData, row: number, col: number, value: string): SheetData {
  return {
    ...sheet,
    data: sheet.data.map((r, ri) => {
      if (ri !== row) return r;
      const newRow = [...r];
      while (newRow.length <= col) newRow.push('');
      newRow[col] = String(value);
      return newRow;
    }),
  };
}

function SpreadsheetViewerComponent({ resource }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCSV = useMemo(() => {
    const mime = resource.file_mime_type || '';
    const filename = (resource.original_filename || resource.title || '').toLowerCase();
    return mime === 'text/csv' || filename.endsWith('.csv');
  }, [resource.file_mime_type, resource.original_filename, resource.title]);

  const canEdit = useMemo(
    () =>
      !isCSV &&
      typeof window !== 'undefined' &&
      Boolean(window.electron?.ai?.tools?.excelSetCell),
    [isCSV]
  );

  const loadSpreadsheet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;

    try {
      setIsLoading(true);
      setError(null);

      const result = await window.electron.resource.readDocumentContent(resource.id);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to read file');
      }

      if (isCSV) {
        const Papa = await import('papaparse');
        const text = decodeBase64ToText(result.data);
        const parsed = Papa.default.parse(text, {
          header: false,
          skipEmptyLines: true,
        });
        setSheets([{ name: 'Sheet1', data: parsed.data as string[][] }]);
      } else {
        const ExcelJS = (await import('exceljs')).default;
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes.buffer);
        const parsedSheets: SheetData[] = [];

        workbook.eachSheet((worksheet) => {
          type RawCell = { value: string; formula: string | null; addr: string };
          const rawGrid: RawCell[][] = [];
          // cellMap: addr → numeric value (for formula evaluation)
          const cellMap = new Map<string, number>();

          // ── Pass 1: read literal values and collect formula strings ──
          let rowIndex = 0;
          worksheet.eachRow({ includeEmpty: true }, (row) => {
            const rawRow: RawCell[] = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              while (rawRow.length < colNumber - 1)
                rawRow.push({ value: '', formula: null, addr: '' });
              const addr = `${colToLetter(colNumber - 1)}${rowIndex + 1}`;
              const v = cell.value;
              let s = '';
              let formula: string | null = null;

              if (v == null) {
                s = '';
              } else if (typeof v !== 'object') {
                s = String(v);
                const n = Number(v);
                if (isFinite(n)) cellMap.set(addr, n);
              } else if (v instanceof Date) {
                s = v.toISOString();
              } else if ('richText' in v) {
                s = (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('');
              } else if ('formula' in v || 'sharedFormula' in v || 'result' in v) {
                const fv = v as { formula?: string; sharedFormula?: string; result?: unknown };
                const res = fv.result;
                if (res != null && typeof res !== 'object') {
                  // Cached result available
                  s = String(res);
                  const n = Number(res);
                  if (isFinite(n)) cellMap.set(addr, n);
                } else if (res instanceof Date) {
                  s = res.toISOString();
                } else if (res != null && typeof res === 'object' && 'error' in res) {
                  s = String((res as { error: unknown }).error);
                } else {
                  // No cached result — record formula for Pass 2
                  formula = (fv.formula ?? fv.sharedFormula ?? '').replace(/^=/, '');
                }
              } else if ('text' in v) {
                s = String((v as { text: unknown }).text);
              } else if ('error' in v) {
                s = String((v as { error: unknown }).error);
              }

              rawRow[colNumber - 1] = { value: s, formula, addr };
            });
            rawGrid.push(rawRow);
            rowIndex++;
          });

          // ── Pass 2: evaluate formula cells (up to 3 dependency layers) ──
          for (let pass = 0; pass < 3; pass++) {
            let changed = false;
            for (const rawRow of rawGrid) {
              for (const rc of rawRow) {
                if (!rc.formula) continue;
                const evaluated = evalFormula(rc.formula, cellMap);
                if (evaluated !== '') {
                  rc.value = evaluated;
                  const n = Number(evaluated);
                  if (isFinite(n)) cellMap.set(rc.addr, n);
                  rc.formula = null;
                  changed = true;
                }
              }
            }
            if (!changed) break;
          }

          const cellValue = (rc: RawCell): string => rc.value;
          const rows = rawGrid.map((rawRow) => rawRow.map(cellValue));
          parsedSheets.push({ name: worksheet.name, data: rows });
        });

        setSheets(parsedSheets);
      }
    } catch (err) {
      console.error('[SpreadsheetViewer] Error loading spreadsheet:', err);
      setError(err instanceof Error ? err.message : 'Failed to load spreadsheet');
    } finally {
      setIsLoading(false);
    }
  }, [resource.id, isCSV]);

  useEffect(() => {
    loadSpreadsheet();
  }, [loadSpreadsheet]);

  // Refresh when Many (AI) modifies the Excel via tools
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubscribe = window.electron.on('resource:updated', (payload: { id?: string }) => {
      if (payload?.id === resource.id) {
        setEditingCell(null);
        loadSpreadsheet();
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, [resource.id, loadSpreadsheet]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  const currentSheet = sheets[activeSheet];

  const saveCell = useCallback(
    async (row: number, col: number, value: string) => {
      const sheet = sheets[activeSheet];
      if (!canEdit || !sheet || !window.electron?.ai?.tools?.excelSetCell) return;

      const cellRef = `${colToLetter(col)}${row + 1}`;
      const parsedValue = parseCellValue(value);

      setSaveError(null);

      try {
        const result = await window.electron.ai.tools.excelSetCell(
          resource.id,
          sheet.name,
          cellRef,
          parsedValue,
          { invokedBy: 'ui' }
        );

        if (result?.success) {
          setSheets((prev) => {
            const next = prev.map((s, i) =>
              i === activeSheet ? applyRowEdit(s, row, col, value) : s
            );
            return next;
          });
        } else {
          setSaveError(result?.error ?? 'Failed to save');
        }
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Failed to save');
      }
    },
    [canEdit, resource.id, activeSheet, sheets]
  );

  const handleCellDoubleClick = useCallback(
    (row: number, col: number) => {
      if (!canEdit || !currentSheet) return;
      const cellValue = currentSheet.data[row]?.[col] ?? '';
      setEditingCell({ row, col });
      setEditValue(String(cellValue));
      setSaveError(null);
    },
    [canEdit, currentSheet]
  );

  const handleEditBlur = useCallback(() => {
    if (!editingCell || !currentSheet) return;
    const prevValue = currentSheet.data[editingCell.row]?.[editingCell.col] ?? '';
    if (editValue !== prevValue) {
      saveCell(editingCell.row, editingCell.col, editValue);
    }
    setEditingCell(null);
  }, [editingCell, editValue, currentSheet, saveCell]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (editValue !== (currentSheet?.data[editingCell.row]?.[editingCell.col] ?? '')) {
          saveCell(editingCell.row, editingCell.col, editValue);
        }
        setEditingCell(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setEditValue(currentSheet?.data[editingCell.row]?.[editingCell.col] ?? '');
        setEditingCell(null);
      }
    },
    [editingCell, editValue, currentSheet, saveCell]
  );

  // Determine max columns for consistent table width
  const maxCols = useMemo(() => {
    if (!currentSheet) return 0;
    return Math.max(...currentSheet.data.map((row) => row.length), 0);
  }, [currentSheet]);

  if (isLoading) {
    return <LoadingState message="Loading spreadsheet..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (!currentSheet || currentSheet.data.length === 0) {
    return <ErrorState error="The spreadsheet is empty" />;
  }

  const isEditing = (row: number, col: number) =>
    editingCell?.row === row && editingCell?.col === col;

  return (
    <div className="spreadsheet-viewer">
      {canEdit && (
        <div className="spreadsheet-edit-hint">
          Double-click a cell to edit. Changes save automatically.
        </div>
      )}
      {isCSV && (
        <div className="spreadsheet-csv-hint">
          CSV files are read-only. Export as XLSX to edit.
        </div>
      )}
      {saveError && (
        <div className="spreadsheet-save-error" role="alert">
          {saveError}
        </div>
      )}

      {/* Sheet tabs (only for multi-sheet XLSX) */}
      {sheets.length > 1 && (
        <div className="sheet-tabs">
          {sheets.map((sheet, idx) => (
            <button
              type="button"
              key={sheet.name}
              className={`sheet-tab ${idx === activeSheet ? 'active' : ''}`}
              onClick={() => {
                setEditingCell(null);
                setSaveError(null);
                setActiveSheet(idx);
              }}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="row-number">#</th>
              {currentSheet.data[0] &&
                Array.from({ length: maxCols }, (_, i) => (
                  <th
                    key={i}
                    title={String(currentSheet.data[0]?.[i] ?? '')}
                    onDoubleClick={() => canEdit && handleCellDoubleClick(0, i)}
                    className={canEdit ? 'editable' : ''}
                  >
                    {isEditing(0, i) ? (
                      <input
                        ref={inputRef}
                        className="cell-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleEditBlur}
                        onKeyDown={handleEditKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Cell value"
                      />
                    ) : (
                      String(currentSheet.data[0]?.[i] ?? '')
                    )}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.data.slice(1).map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="row-number">{rowIdx + 2}</td>
                {Array.from({ length: maxCols }, (_, colIdx) => {
                  const excelRow = rowIdx + 1;
                  return (
                    <td
                      key={colIdx}
                      title={String(row[colIdx] ?? '')}
                      onDoubleClick={() => canEdit && handleCellDoubleClick(excelRow, colIdx)}
                      className={canEdit ? 'editable' : ''}
                    >
                      {isEditing(excelRow, colIdx) ? (
                        <input
                          ref={inputRef}
                          className="cell-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={handleEditBlur}
                          onKeyDown={handleEditKeyDown}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Cell value"
                        />
                      ) : (
                        String(row[colIdx] ?? '')
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .spreadsheet-viewer{display:flex;flex-direction:column;width:100%;height:100%;background:var(--bg);overflow:hidden}
        .spreadsheet-edit-hint{flex-shrink:0;padding:6px 16px;font-size:12px;color:var(--tertiary-text);background:var(--bg-secondary);border-bottom:1px solid var(--border)}
        .spreadsheet-csv-hint{flex-shrink:0;padding:6px 16px;font-size:12px;color:var(--tertiary-text);background:var(--bg-secondary);border-bottom:1px solid var(--border)}
        .spreadsheet-save-error{flex-shrink:0;padding:8px 16px;font-size:12px;color:var(--error);background:var(--error-bg)}
        .sheet-tabs{display:flex;gap:0;padding:0 16px;border-bottom:1px solid var(--border);background:var(--bg-secondary);flex-shrink:0;overflow-x:auto}
        .sheet-tab{padding:10px 20px;border:none;background:transparent;font-size:13px;font-weight:500;color:var(--secondary-text);cursor:pointer;border-bottom:2px solid transparent;transition:all var(--transition-fast);white-space:nowrap}
        .sheet-tab:hover{color:var(--primary-text);background:var(--bg-hover)}
        .sheet-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
        .table-container{flex:1;overflow:auto;padding:0}
        .spreadsheet-viewer table{width:max-content;min-width:100%;border-collapse:collapse;font-size:13px}
        .spreadsheet-viewer thead{position:sticky;top:0;z-index:10}
        .spreadsheet-viewer th{background:var(--bg-tertiary);color:var(--primary-text);font-weight:600;padding:8px 16px;text-align:left;border:1px solid var(--border);white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis}
        .spreadsheet-viewer th.editable{cursor:cell}
        .spreadsheet-viewer td{padding:6px 16px;color:var(--secondary-text);border:1px solid var(--border);white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis}
        .spreadsheet-viewer td.editable{cursor:cell}
        .spreadsheet-viewer tbody tr:nth-child(even) td{background:var(--bg-secondary)}
        .spreadsheet-viewer tbody tr:hover td{background:var(--bg-hover)}
        .spreadsheet-viewer .cell-input{width:100%;min-width:60px;padding:4px 8px;margin:-4px -8px;border:1px solid var(--accent);border-radius:4px;background:var(--bg);color:var(--primary-text);font:inherit;outline:none;box-shadow:0 0 0 2px var(--accent)}
        .spreadsheet-viewer .row-number{color:var(--tertiary-text);background:var(--bg-tertiary)!important;font-size:11px;text-align:center;padding:6px 10px;font-weight:500;min-width:40px;position:sticky;left:0;z-index:5}
        .spreadsheet-viewer thead .row-number{z-index:15}
      `,
        }}
      />
    </div>
  );
}

/**
 * Decode base64 string to UTF-8 text
 */
function decodeBase64ToText(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export default React.memo(SpreadsheetViewerComponent);
