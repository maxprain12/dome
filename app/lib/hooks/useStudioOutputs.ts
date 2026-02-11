/**
 * useStudioOutputs Hook
 *
 * Loads, caches, and refreshes studio outputs for a project.
 * Listens to studio:outputCreated for live updates when flashcards are created from AI.
 */

import { useEffect, useCallback, useState } from 'react';
import { useAppStore } from '@/lib/store/useAppStore';

export function useStudioOutputs(projectId?: string | null) {
  const setStudioOutputs = useAppStore((s) => s.setStudioOutputs);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || typeof window === 'undefined' || !window.electron?.db?.studio) return;

    try {
      setIsLoading(true);
      const result = await window.electron.db.studio.getByProject(projectId);
      if (result.success && result.data) {
        setStudioOutputs(result.data);
      }
    } catch (err) {
      console.error('[useStudioOutputs] Failed to load:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, setStudioOutputs]);

  useEffect(() => {
    load();
  }, [load]);

  // Listen for studio:outputCreated (from flashcardCreate)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;

    const unsubscribe = window.electron.on('studio:outputCreated', (output: { project_id?: string }) => {
      if (projectId && output.project_id === projectId) {
        addStudioOutput(output as Parameters<typeof addStudioOutput>[0]);
        setActiveStudioOutput(output as Parameters<typeof setActiveStudioOutput>[1]);
      }
    });

    return unsubscribe;
  }, [projectId, addStudioOutput, setActiveStudioOutput]);

  return { load, isLoading };
}
