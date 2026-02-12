// PyodideInterface from loadPyodide return type
import type { NotebookOutput } from '@/types';

export type PyodideRunResult = {
  success: boolean;
  outputs: NotebookOutput[];
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodideInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadPromise: Promise<any> | null = null;

export async function loadPyodideKernel() {
  if (pyodideInstance) return pyodideInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { loadPyodide } = await import('pyodide');
    const pyodide = await loadPyodide({
      // Use CDN - works in dev; for production could use indexURL to bundled assets
    });
    // Preload numpy, matplotlib for common use
    await pyodide.loadPackage(['numpy', 'matplotlib']);
    pyodideInstance = pyodide;
    return pyodide;
  })();

  return loadPromise;
}

export async function runPythonCode(code: string): Promise<PyodideRunResult> {
    const outputs: NotebookOutput[] = [];

  try {
    const pyodide = await loadPyodideKernel();

    // Capture stdout
    const stdoutChunks: string[] = [];
    pyodide.setStdout({
      batched: (msg: string) => {
        stdoutChunks.push(msg);
      },
    });

    // Capture stderr
    const stderrChunks: string[] = [];
    pyodide.setStderr({
      batched: (msg: string) => {
        stderrChunks.push(msg);
      },
    });

    try {
      const result = await pyodide.runPythonAsync(code);

      // Emit stdout
      if (stdoutChunks.length > 0) {
        outputs.push({
          output_type: 'stream',
          name: 'stdout',
          text: stdoutChunks.join(''),
        });
      }

      // Emit stderr
      if (stderrChunks.length > 0) {
        outputs.push({
          output_type: 'stream',
          name: 'stderr',
          text: stderrChunks.join(''),
        });
      }

      // If result is not undefined, add as execute_result
      if (result !== undefined && result !== null) {
        const strVal = String(result);
        if (strVal && strVal !== 'None') {
          outputs.push({
            output_type: 'execute_result',
            execution_count: 1,
            data: { 'text/plain': strVal },
            metadata: {},
          });
        }
      }

      return { success: true, outputs };
    } catch (pyError) {
      const err = pyError as Error;
      const traceback = err.message || String(pyError);
      outputs.push({
        output_type: 'error',
        ename: 'Error',
        evalue: traceback,
        traceback: traceback.split('\n'),
      });
      return { success: false, outputs };
    } finally {
      pyodide.setStdout();
      pyodide.setStderr();
    }
  } catch (loadError) {
    const err = loadError as Error;
    return {
      success: false,
      outputs: [
        {
          output_type: 'error',
          ename: 'LoadError',
          evalue: err.message || 'Failed to load Pyodide',
          traceback: [err.message || ''],
        },
      ],
      error: err.message,
    };
  }
}

export async function loadPackages(packages: string[]): Promise<void> {
  const pyodide = await loadPyodideKernel();
  await pyodide.loadPackage(packages);
}
