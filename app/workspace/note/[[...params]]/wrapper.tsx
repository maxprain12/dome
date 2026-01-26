'use client';

import NoteWorkspaceClient from './client';
import { useParams } from 'next/navigation';

export default function NoteWorkspaceClientWrapper() {
  const params = useParams();
  // For catch-all routes, params is an array or undefined
  const paramArray = params.params as string[] | undefined;
  const resourceId = paramArray?.[0] || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary)' }}>No note selected</p>
      </div>
    );
  }

  return <NoteWorkspaceClient resourceId={resourceId} />;
}
