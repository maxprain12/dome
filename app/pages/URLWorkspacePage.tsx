import { useSearchParams } from 'react-router-dom';
import URLWorkspaceClient from '@/workspace/url/client';

export default function URLWorkspacePage() {
  const [searchParams] = useSearchParams();
  // Read resource ID from query parameter
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No URL selected</p>
      </div>
    );
  }

  return <URLWorkspaceClient resourceId={resourceId} />;
}
