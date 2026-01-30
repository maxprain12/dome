'use client';

import WorkspaceClient from './client';
import { useSearchParams } from 'next/navigation';

export default function WorkspaceClientWrapper() {
  const searchParams = useSearchParams();
  // Read resource ID from query parameter instead of route parameter
  // This is required for Next.js static export which doesn't support dynamic routes
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No resource selected</p>
      </div>
    );
  }

  return <WorkspaceClient resourceId={resourceId} />;
}
