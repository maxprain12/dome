/**
 * NoteFocusPage — bare popout window for distraction-free note editing.
 *
 * Loaded by `windowManager.create('note-focus:<id>', ..., '/focus/note/<id>')`
 * from the renderer via `window.electron.invoke('window:create', ...)`.
 *
 * Renders a single note editor with the standard `WorkspaceHeader` (which is
 * already `drag-region` and works as the OS title bar — traffic lights on
 * macOS or `titleBarOverlay` controls on Windows live above it). NO AppShell,
 * sidebar, tabs or Many panel are mounted here.
 *
 * Cross-window sync is handled inside `NoteWorkspaceClient` via the
 * `resource:updated` broadcast.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import NoteWorkspaceClient from '@/components/notes/NoteWorkspaceClient';

interface NoteFocusPageProps {
  resourceId: string;
}

export default function NoteFocusPage({ resourceId }: NoteFocusPageProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState<string>('');
  const loadCurrentProject = useAppStore((s) => s.loadCurrentProject);

  useEffect(() => {
    void loadCurrentProject();
  }, [loadCurrentProject]);

  // Read note title once for the OS window title.
  useEffect(() => {
    if (!resourceId || !window.electron?.db?.resources) return;
    void window.electron.db.resources.getById(resourceId).then((res) => {
      if (res?.success && res.data) {
        setTitle((res.data as { title?: string }).title ?? '');
      }
    });
  }, [resourceId]);

  // Live-update the OS title when the note title changes elsewhere.
  useEffect(() => {
    if (!window.electron?.on) return undefined;
    const unsub = window.electron.on(
      'resource:updated',
      (payload: { id?: string; updates?: { title?: string } }) => {
        if (payload?.id !== resourceId) return;
        if (typeof payload.updates?.title === 'string') {
          setTitle(payload.updates.title);
        }
      },
    );
    return () => unsub?.();
  }, [resourceId]);

  useEffect(() => {
    document.title = title
      ? `${title} — Dome`
      : t('focused_editor.popout_title', 'Editor enfocado');
  }, [title, t]);

  return (
    <div
      className="flex h-screen w-screen flex-col"
      style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
    >
      <NoteWorkspaceClient resourceId={resourceId} />
    </div>
  );
}
