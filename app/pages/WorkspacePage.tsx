import { useSearchParams } from 'react-router-dom';
import WorkspaceClient from '@/workspace/[[...params]]/client';

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  // Read resource ID from query parameter
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
