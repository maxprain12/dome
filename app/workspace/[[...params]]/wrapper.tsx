'use client';

import WorkspaceClient from './client';
import { useParams } from 'next/navigation';

export default function WorkspaceClientWrapper() {
  const params = useParams();
  // For catch-all routes, params is an array or undefined
  const paramArray = params.params as string[] | undefined;
  const resourceId = paramArray?.[0] || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary)' }}>No resource selected</p>
      </div>
    );
  }

  return <WorkspaceClient resourceId={resourceId} />;
}
