'use client';

import URLWorkspaceClient from './client';
import { useSearchParams } from 'next/navigation';

export default function URLWorkspaceClientWrapper() {
  const searchParams = useSearchParams();
  // Read resource ID from query parameter instead of route parameter
  // This is required for Next.js static export which doesn't support dynamic routes
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary)' }}>No URL selected</p>
      </div>
    );
  }

  return <URLWorkspaceClient resourceId={resourceId} />;
}
