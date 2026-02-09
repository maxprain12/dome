
import React, { useState, useEffect, useMemo } from 'react';
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

function SpreadsheetViewerComponent({ resource }: SpreadsheetViewerProps) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCSV = useMemo(() => {
    const mime = resource.file_mime_type || '';
    const filename = (resource.original_filename || resource.title || '').toLowerCase();
    return mime === 'text/csv' || filename.endsWith('.csv');
  }, [resource.file_mime_type, resource.original_filename, resource.title]);

  useEffect(() => {
    async function loadSpreadsheet() {
      if (typeof window === 'undefined' || !window.electron) return;

      try {
        setIsLoading(true);
        setError(null);

        const result = await window.electron.resource.readDocumentContent(resource.id);
        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to read file');
        }

        if (isCSV) {
          // Dynamically import papaparse for CSV
          const Papa = await import('papaparse');

          // Decode base64 to text
          const text = decodeBase64ToText(result.data);

          const parsed = Papa.default.parse(text, {
            header: false,
            skipEmptyLines: true,
          });

          setSheets([{ name: 'Sheet1', data: parsed.data as string[][] }]);
        } else {
          // Dynamically import xlsx for XLSX/XLS
          const XLSX = await import('xlsx');

          // Decode base64 to Uint8Array
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
    }

    loadSpreadsheet();
  }, [resource.id, isCSV]);

  const currentSheet = sheets[activeSheet];

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

  return (
    <div className="spreadsheet-viewer">
      {/* Sheet tabs (only for multi-sheet XLSX) */}
      {sheets.length > 1 && (
        <div className="sheet-tabs">
          {sheets.map((sheet, idx) => (
            <button
              key={sheet.name}
              className={`sheet-tab ${idx === activeSheet ? 'active' : ''}`}
              onClick={() => setActiveSheet(idx)}
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
                  <th key={i}>
                    {String(currentSheet.data[0]?.[i] ?? '')}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {currentSheet.data.slice(1).map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="row-number">{rowIdx + 2}</td>
                {Array.from({ length: maxCols }, (_, colIdx) => (
                  <td key={colIdx} title={String(row[colIdx] ?? '')}>
                    {String(row[colIdx] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .spreadsheet-viewer {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          background: var(--bg);
          overflow: hidden;
        }

        .sheet-tabs {
          display: flex;
          gap: 0;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
          overflow-x: auto;
        }

        .sheet-tab {
          padding: 10px 20px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 500;
          color: var(--secondary-text);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }

        .sheet-tab:hover {
          color: var(--primary-text);
          background: var(--bg-hover);
        }

        .sheet-tab.active {
          color: var(--accent);
          border-bottom-color: var(--accent);
        }

        .table-container {
          flex: 1;
          overflow: auto;
          padding: 0;
        }

        table {
          width: max-content;
          min-width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        thead {
          position: sticky;
          top: 0;
          z-index: 10;
        }

        th {
          background: var(--bg-tertiary);
          color: var(--primary-text);
          font-weight: 600;
          padding: 8px 16px;
          text-align: left;
          border: 1px solid var(--border);
          white-space: nowrap;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        td {
          padding: 6px 16px;
          color: var(--secondary-text);
          border: 1px solid var(--border);
          white-space: nowrap;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        tbody tr:nth-child(even) td {
          background: var(--bg-secondary);
        }

        tbody tr:hover td {
          background: var(--bg-hover);
        }

        .row-number {
          color: var(--tertiary-text);
          background: var(--bg-tertiary) !important;
          font-size: 11px;
          text-align: center;
          padding: 6px 10px;
          font-weight: 500;
          min-width: 40px;
          position: sticky;
          left: 0;
          z-index: 5;
        }

        thead .row-number {
          z-index: 15;
        }
      `}</style>
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
