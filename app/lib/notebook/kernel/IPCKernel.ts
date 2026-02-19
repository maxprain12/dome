import type { NotebookOutput } from '@/types';

export type PyodideRunResult = {
  success: boolean;
  outputs: NotebookOutput[];
  error?: string;
};

export interface RunPythonOptions {
  /** Per-cell capture (IPC): only show output from this cell index */
  cells?: string[];
  targetCellIndex?: number;
  /** Pyodide: run only this cell's code (kernel is stateful) */
  currentCellCode?: string;
  /** Working directory for Python execution (notebook workspace folder) */
  cwd?: string;
  /** Path to Python virtual environment (venv directory) */
  venvPath?: string;
}

/**
 * IPC kernel - runs Python via Electron main process (system Python)
 * Use when running inside Electron; replaces Pyodide for native Python with full pip ecosystem
 * When options.cells and options.targetCellIndex are set, only the target cell's output is returned.
 */
export async function runPythonCode(code: string, options?: RunPythonOptions): Promise<PyodideRunResult> {
  const electron = typeof window !== 'undefined' ? window.electron : undefined;
  if (!electron?.notebook?.runPython) {
    return {
      success: false,
      outputs: [
        {
          output_type: 'error',
          ename: 'RuntimeError',
          evalue: 'Notebook requires Electron. Python execution is not available in web browser.',
          traceback: [],
        },
      ],
      error: 'Electron notebook API not available',
    };
  }
  return electron.notebook.runPython(code, options);
}

/**
 * Check if Python is available (IPC kernel)
 */
export async function checkPythonAvailable(): Promise<{ available: boolean; version?: string; path?: string }> {
  const electron = typeof window !== 'undefined' ? window.electron : undefined;
  if (!electron?.notebook?.checkPython) {
    return { available: false };
  }
  return electron.notebook.checkPython();
}
