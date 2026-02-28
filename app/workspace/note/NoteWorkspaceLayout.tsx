'use client';

import NoteWorkspaceClient from './[[...params]]/client';

interface NoteWorkspaceLayoutProps {
  initialNoteId?: string | null;
}

export default function NoteWorkspaceLayout({ initialNoteId }: NoteWorkspaceLayoutProps) {
  const resourceId = initialNoteId ?? '';

  return (
    <div className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)', overflow: 'clip' }}>
      <div className="flex-1 min-h-0 overflow-hidden">
        {resourceId ? (
          <NoteWorkspaceClient resourceId={resourceId} />
        ) : (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--secondary-text)' }}>
            <p className="text-sm">Open a note from search or create one from the command palette</p>
          </div>
        )}
      </div>
    </div>
  );
}
