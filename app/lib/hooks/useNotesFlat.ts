'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Note } from '@/types';

export interface UseNotesFlatOptions {
  projectId?: string;
}

export function useNotesFlat(options: UseNotesFlatOptions = {}) {
  const projectId = options.projectId ?? 'default';
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.notes?.getByProject) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electron.db.notes.getByProject(projectId);
      if (result.success && result.data) {
        setNotes(result.data as Note[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const unsubCreate = window.electron.on('note:created', (note: Note) => {
      if (note.project_id !== projectId) return;
      setNotes((prev) => [...prev, note].sort((a, b) => a.position.localeCompare(b.position)));
    });
    const unsubUpdate = window.electron.on('note:updated', ({ id, updates }: { id: string; updates: Partial<Note> }) => {
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
      );
    });
    const unsubRemove = window.electron.on('note:removed', ({ id }: { id: string }) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
    });
    const unsubRestore = window.electron.on('note:restored', (note: Note) => {
      if (note.project_id !== projectId) return;
      setNotes((prev) => [...prev, note].sort((a, b) => a.position.localeCompare(b.position)));
    });
    return () => {
      unsubCreate();
      unsubUpdate();
      unsubRemove();
      unsubRestore();
    };
  }, [projectId]);

  const createNote = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.notes) return null;
    try {
      const result = await window.electron.db.notes.create({
        project_id: projectId,
        parent_note_id: null,
        title: 'Untitled',
      });
      if (result.success && result.data) return result.data as Note;
    } catch (err) {
      console.error('Error creating note:', err);
    }
    return null;
  }, [projectId]);

  const removeNote = useCallback(async (noteId: string) => {
    if (typeof window === 'undefined' || !window.electron?.db?.notes) return false;
    try {
      const result = await window.electron.db.notes.remove(noteId);
      return result.success;
    } catch (err) {
      console.error('Error removing note:', err);
      return false;
    }
  }, []);

  const duplicateNote = useCallback(
    async (noteId: string) => {
      if (typeof window === 'undefined' || !window.electron?.db?.notes) return null;
      try {
        const result = await window.electron.db.notes.duplicate(noteId, projectId, null);
        if (result.success && result.data) return result.data as Note;
      } catch (err) {
        console.error('Error duplicating note:', err);
      }
      return null;
    },
    [projectId]
  );

  return {
    notes,
    isLoading,
    error,
    fetchNotes,
    createNote,
    removeNote,
    duplicateNote,
  };
}
