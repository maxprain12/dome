'use client';

import NoteWorkspaceClient from './client';
import { useSearchParams } from 'next/navigation';

export default function NoteWorkspaceClientWrapper() {
  const searchParams = useSearchParams();
  // Read resource ID from query parameter instead of route parameter
  // This is required for Next.js static export which doesn't support dynamic routes
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary)' }}>No note selected</p>
      </div>
    );
  }

  return <NoteWorkspaceClient resourceId={resourceId} />;
}
