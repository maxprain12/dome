
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
        const XLSX = await import('xlsx');
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const workbook = XLSX.read(bytes, { type: 'array' });
        const parsedSheets: SheetData[] = workbook.SheetNames
          .filter((name) => workbook.Sheets[name])
          .map((name) => ({
            name,
            data: XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[name]!, {
              header: 1,
              defval: '',
            }),
          }));
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
    return unsubscribe;
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
          parsedValue
        );

        if (result?.success) {
          setSheets((prev) => {
            const next = prev.map((s, i) =>
              i === activeSheet
                ? {
                    ...s,
                    data: s.data.map((r, ri) => {
                      if (ri !== row) return r;
                      const newRow = [...r];
                      while (newRow.length <= col) newRow.push('');
                      newRow[col] = String(value);
                      return newRow;
                    }),
                  }
                : s
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
