'use client';

import { useState, useCallback } from 'react';
import { Play, Loader2, Info } from 'lucide-react';
import { usePyodide } from '@/lib/notebook/PyodideProvider';
import { useTextareaAutoResize } from '@/lib/hooks/useTextareaAutoResize';
import type { NotebookCodeCell, NotebookOutput } from '@/types';

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

export default function CodeCell({
  cell,
  onChange,
  onOutputsChange,
  onExecutionCountChange,
  editable = true,
  onRun: externalRun,
  onKeyDown: externalKeyDown,
}: CodeCellProps) {
  const [isRunning, setIsRunning] = useState(false);
  const { runPython, isLoaded, isLoading, loadError, ensureLoaded } = usePyodide();
  const textareaRef = useTextareaAutoResize(sourceToString(cell.source));

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

  const renderOutput = (output: NotebookOutput, idx: number) => {
    if (output.output_type === 'stream' && 'text' in output) {
      const text = Array.isArray(output.text) ? output.text.join('') : output.text;
      return (
        <div key={idx} className="overflow-x-auto max-w-full">
          <pre
            className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
            style={{
              background: output.name === 'stderr' ? 'var(--error-bg)' : 'var(--bg-secondary)',
              color: output.name === 'stderr' ? 'var(--error)' : 'var(--primary-text)',
            }}
          >
            {text}
          </pre>
        </div>
      );
    }
    if ((output.output_type === 'execute_result' || output.output_type === 'display_data') && 'data' in output) {
      const data = output.data as Record<string, string | string[]>;
      const imagePng = data['image/png'];
      const imageSvg = data['image/svg+xml'];
      const textHtml = data['text/html'];
      const textPlain = data['text/plain'];

      if (imagePng) {
        const src = typeof imagePng === 'string' ? imagePng : imagePng[0];
        return (
          <div key={idx} className="p-2">
            <img
              src={`data:image/png;base64,${src}`}
              alt="Notebook cell output"
              className="max-w-full h-auto rounded"
            />
          </div>
        );
      }
      if (imageSvg) {
        const svg = typeof imageSvg === 'string' ? imageSvg : imageSvg[0];
        return (
          <div key={idx} className="p-2" dangerouslySetInnerHTML={{ __html: svg }} />
        );
      }
      if (textHtml) {
        const html = Array.isArray(textHtml) ? textHtml.join('') : textHtml;
        return (
          <div
            key={idx}
            className="p-2 prose prose-sm max-w-none break-words overflow-x-auto"
            style={{
              color: 'var(--primary-text)',
              minHeight: '400px',
              overflow: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      const text = typeof textPlain === 'string' ? textPlain : Array.isArray(textPlain) ? textPlain.join('') : JSON.stringify(data);
      return (
        <div key={idx} className="overflow-x-auto max-w-full">
          <pre
            className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
            style={{ background: 'var(--bg-secondary)', color: 'var(--primary-text)' }}
          >
            {text}
          </pre>
        </div>
      );
    }
    if (output.output_type === 'error') {
      const tb = output.traceback?.join('\n') || `${output.ename}: ${output.evalue}`;
      return (
        <div key={idx} className="overflow-x-auto max-w-full">
          <pre
            className="text-sm font-mono whitespace-pre-wrap break-words p-2 rounded min-w-0"
            style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
          >
            {tb}
          </pre>
        </div>
      );
    }
    return null;
  };

  const executionCount = cell.execution_count;

  return (
    <div
      className="code-cell rounded-xl overflow-hidden"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-start gap-2 p-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={handleRun}
          disabled={isRunning || isLoading}
          className="p-1.5 rounded shrink-0 cursor-pointer transition-colors duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
          title="Run cell (Shift+Enter)"
          aria-label="Ejecutar celda"
          aria-busy={isRunning || isLoading}
        >
          {isRunning || isLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Play size={16} />
          )}
        </button>
        {executionCount != null && (
          <span
            className="text-xs font-mono shrink-0 py-1"
            style={{ color: 'var(--tertiary)' }}
          >
            [{executionCount}]
          </span>
        )}
        <textarea
          ref={textareaRef}
          value={sourceToString(cell.source)}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleRun();
            }
            externalKeyDown?.(e);
          }}
          disabled={!editable}
          className="flex-1 min-h-[80px] p-2 font-mono text-sm min-w-0 border-0 rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 transition-shadow duration-150"
          style={{
            background: 'var(--bg)',
            color: 'var(--primary-text)',
            fieldSizing: 'content',
          } as React.CSSProperties}
          placeholder="# Escribe código Python... (Shift+Enter to run)"
        />
      </div>

      {!isLoaded && !isLoading && !loadError && (
        <div
          className="flex items-center gap-2 p-3 text-sm rounded-b-lg"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--secondary-text)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <Info size={16} className="shrink-0" style={{ color: 'var(--accent)' }} />
          <span>Haz clic en Run para cargar el runtime de Python (~10s la primera vez).</span>
        </div>
      )}
      {isLoading && (
        <div
          className="flex items-center gap-2 p-3 text-sm rounded-b-lg"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--secondary-text)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <Loader2 size={16} className="animate-spin shrink-0" style={{ color: 'var(--accent)' }} />
          <span>Cargando runtime de Python...</span>
        </div>
      )}
      {loadError && (
        <div
          className="p-3 text-sm rounded-b-lg border border-t-0"
          style={{
            background: 'var(--error-bg)',
            color: 'var(--error)',
            borderColor: 'var(--error)',
          }}
        >
          {loadError}
        </div>
      )}

      {cell.outputs.length > 0 && (
        <div
          className="p-2 space-y-1 content-visibility-auto"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
          }}
        >
          {cell.outputs.map((o, i) => (
            <div key={i}>{renderOutput(o, i)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
