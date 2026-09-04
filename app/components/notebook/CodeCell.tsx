'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  PlayIcon,
  Loading03Icon,
  InformationCircleIcon,
} from '@hugeicons/core-free-icons';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePyodide } from '@/lib/notebook/PyodideProvider';
import { typesetDocsClass } from '@/lib/typeset';
import CodeCellEditor from './CodeCellEditor';
import type { NotebookCodeCell, NotebookOutput } from '@/types';
import { stableStringHash } from '@/lib/utils/stableStringHash';

interface CodeCellProps {
  cell: NotebookCodeCell;
  onChange: (source: string) => void;
  onOutputsChange: (outputs: NotebookOutput[]) => void;
  onExecutionCountChange: (count: number | null) => void;
  editable?: boolean;
  cellIndex: number;
  /** Optional: parent can provide run to support Run above / Run all */
  onRun?: () => Promise<void>;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

function sourceToString(source: string | string[]): string {
  return typeof source === 'string' ? source : source.join('');
}

function firstString(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] ?? '' : '';
}

function joinText(value: string | string[] | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value.join('') : '';
}

function renderStreamOutput(output: NotebookOutput & { output_type: 'stream' }) {
  const text = joinText(output.text);
  return (
    <div className="overflow-x-auto max-w-full">
      <pre
        className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
        style={{
          background: output.name === 'stderr' ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : 'var(--card)',
          color: output.name === 'stderr' ? 'var(--destructive)' : 'var(--foreground)',
        }}
      >
        {text}
      </pre>
    </div>
  );
}

function renderImagePngOutput(value: string | string[]) {
  const src = typeof value === 'string' ? value : value[0];
  return (
    <div className="p-2">
      <img
        src={`data:image/png;base64,${src}`}
        alt="Notebook cell output"
        className="max-w-full h-auto rounded"
      />
    </div>
  );
}

function renderImageSvgOutput(value: string | string[]) {
  const svg = firstString(value);
  return <div className="p-2" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function renderHtmlOutput(value: string | string[]) {
  const html = joinText(value);
  return (
    <div
      className={typesetDocsClass('min-h-[400px] overflow-auto p-2 break-words')}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderPlainTextOutput(data: Record<string, string | string[]>) {
  const value = data['text/plain'];
  const text =
    typeof value === 'string' ? value : Array.isArray(value) ? value.join('') : JSON.stringify(data);
  return (
    <div className="overflow-x-auto max-w-full">
      <pre
        className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
        style={{ background: 'var(--card)', color: 'var(--foreground)' }}
      >
        {text}
      </pre>
    </div>
  );
}

function renderDisplayDataOutput(
  output: NotebookOutput & {
    output_type: 'execute_result' | 'display_data';
    data: Record<string, string | string[]>;
  }
) {
  const data = output.data;
  if (data['image/png']) return renderImagePngOutput(data['image/png']);
  if (data['image/svg+xml']) return renderImageSvgOutput(data['image/svg+xml']);
  if (data['text/html']) return renderHtmlOutput(data['text/html']);
  return renderPlainTextOutput(data);
}

function renderErrorOutput(output: NotebookOutput & { output_type: 'error' }) {
  const tb = output.traceback?.join('\n') || `${output.ename}: ${output.evalue}`;
  return (
    <div className="overflow-x-auto max-w-full">
      <pre
        className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
        style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)' }}
      >
        {tb}
      </pre>
    </div>
  );
}

function renderNotebookOutput(output: NotebookOutput) {
  if (output.output_type === 'stream' && 'text' in output) {
    return renderStreamOutput(output);
  }
  if ((output.output_type === 'execute_result' || output.output_type === 'display_data') && 'data' in output) {
    return renderDisplayDataOutput(output);
  }
  if (output.output_type === 'error') {
    return renderErrorOutput(output);
  }
  return null;
}

export default function CodeCell({
  cell,
  onChange,
  onOutputsChange,
  onExecutionCountChange,
  editable = true,
  onRun: externalRun,
  onKeyDown: _externalKeyDown,
}: CodeCellProps) {
  const { t } = useTranslation();
  const [isRunning, setIsRunning] = useState(false);
  const { runPython, isLoaded, isLoading, loadError, ensureLoaded: _ensureLoaded } = usePyodide();

  const doRun = useCallback(async () => {
    const code = sourceToString(cell.source).trim();
    if (!code) return;

    setIsRunning(true);
    onOutputsChange([]);
    onExecutionCountChange(null);

    try {
      if (externalRun) {
        await externalRun();
      } else {
        const result = await runPython(code);
        onOutputsChange(result.outputs);
        onExecutionCountChange(result.success ? 1 : null);
      }
    } catch (err) {
      onOutputsChange([
        {
          output_type: 'error',
          ename: 'Error',
          evalue: err instanceof Error ? err.message : String(err),
          traceback: [],
        },
      ]);
      onExecutionCountChange(null);
    } finally {
      setIsRunning(false);
    }
  }, [cell.source, runPython, onOutputsChange, onExecutionCountChange, externalRun]);

  const handleRun = useCallback(async () => {
    if (externalRun) {
      setIsRunning(true);
      try {
        await externalRun();
      } finally {
        setIsRunning(false);
      }
    } else {
      await doRun();
    }
  }, [externalRun, doRun]);

  const executionCount = cell.execution_count;

  return (
    <div
      className="code-cell rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start gap-2 p-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || isLoading}
          className="p-1.5 rounded shrink-0 cursor-pointer transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
          title="Run cell (Shift+Enter)"
          aria-label={t('notebook.run_cell')}
          aria-busy={isRunning || isLoading}
        >
          {isRunning || isLoading ? (
            <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
          ) : (
            <HugeiconsIcon icon={PlayIcon} size={16} />
          )}
        </button>
        {executionCount != null && (
          <span
            className="text-xs font-mono shrink-0 py-1 text-muted-foreground"
          >
            [{executionCount}]
          </span>
        )}
        <CodeCellEditor
          value={sourceToString(cell.source)}
          onChange={onChange}
          onRun={handleRun}
          editable={editable}
          placeholder={t('notebook.code_placeholder')}
          className="flex-1"
        />
      </div>

      {!isLoaded && !isLoading && !loadError && (
        <div
          className="flex items-center gap-2 p-3 text-sm rounded-b-lg"
          style={{
            background: 'var(--muted)',
            color: 'var(--muted-foreground)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={16} className="shrink-0 text-primary" />
          <span>{t('notebook.python_runtime_hint')}</span>
        </div>
      )}
      {isLoading && (
        <div
          className="flex items-center gap-2 p-3 text-sm rounded-b-lg"
          style={{
            background: 'var(--muted)',
            color: 'var(--muted-foreground)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin shrink-0 text-primary" />
          <span>{t('notebook.loading_python')}</span>
        </div>
      )}
      {loadError && (
        <div
          className="p-3 text-sm rounded-b-lg border border-t-0"
          style={{
            background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
            color: 'var(--destructive)',
            borderColor: 'var(--destructive)',
          }}
        >
          {loadError}
        </div>
      )}

      {cell.outputs.length > 0 && (
        <div
          className="p-2 flex flex-col gap-y-1 content-visibility-auto"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--muted)',
          }}
        >
          {(() => {
            const counts = new Map<string, number>();
            return cell.outputs.map((o) => {
              const h = stableStringHash(JSON.stringify(o));
              const ord = (counts.get(h) ?? 0) + 1;
              counts.set(h, ord);
              return (
                <div key={`${h}:${ord}`}>{renderNotebookOutput(o)}</div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}
