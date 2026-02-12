'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { loadPyodideKernel, runPythonCode as runPyodideCode, type PyodideRunResult } from './kernel/PyodideKernel';
import { runPythonCode as runIPCCode, checkPythonAvailable, type RunPythonOptions } from './kernel/IPCKernel';

/** True when running in Electron with notebook IPC */
const useIPCKernel = typeof window !== 'undefined' && !!window.electron?.notebook;

interface PyodideContextValue {
  isLoaded: boolean;
  isLoading: boolean;
  loadError: string | null;
  runPython: (code: string, options?: RunPythonOptions) => Promise<PyodideRunResult>;
  ensureLoaded: () => Promise<{ ok: boolean; error?: string }>;
}

const PyodideContext = createContext<PyodideContextValue | null>(null);

export function PyodideProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const ensureLoaded = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (isLoaded) return { ok: true };
    if (isLoading) return { ok: false, error: 'Loading...' };

    setIsLoading(true);
    setLoadError(null);
    try {
      if (useIPCKernel) {
        const { available } = await checkPythonAvailable();
        if (!available) {
          const err = 'Python not found. Install Python 3 and ensure it is in your PATH.';
          setLoadError(err);
          return { ok: false, error: err };
        }
        setIsLoaded(true);
        return { ok: true };
      }
      await loadPyodideKernel();
      setIsLoaded(true);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load Python';
      setLoadError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, isLoading]);

  const runPython = useCallback(
    async (code: string, options?: RunPythonOptions): Promise<PyodideRunResult> => {
      const loaded = await ensureLoaded();
      if (!loaded.ok) {
        return {
          success: false,
          outputs: [{ output_type: 'error', ename: 'Error', evalue: loaded.error || 'Failed to load', traceback: [] }],
          error: loaded.error,
        };
      }
      if (useIPCKernel) return runIPCCode(code, options);
      // Pyodide: kernel is stateful, run only current cell's code
      const toRun = options?.currentCellCode ?? code;
      return runPyodideCode(toRun);
    },
    [ensureLoaded]
  );

  const value: PyodideContextValue = {
    isLoaded,
    isLoading,
    loadError,
    runPython,
    ensureLoaded,
  };

  return (
    <PyodideContext.Provider value={value}>
      {children}
    </PyodideContext.Provider>
  );
}

export function usePyodide(): PyodideContextValue {
  const ctx = useContext(PyodideContext);
  if (!ctx) {
    throw new Error('usePyodide must be used within PyodideProvider');
  }
  return ctx;
}
