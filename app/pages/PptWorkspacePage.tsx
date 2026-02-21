import { useSearchParams } from 'react-router-dom';
import PptWorkspaceClient from '@/workspace/ppt/client';

export default function PptWorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No presentation selected</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PptWorkspaceClient resourceId={resourceId} />
    </div>
  );
}
