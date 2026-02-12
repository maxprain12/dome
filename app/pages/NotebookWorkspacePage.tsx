import { useSearchParams } from 'react-router-dom';
import NotebookWorkspaceClient from '@/workspace/notebook/[[...params]]/client';

export default function NotebookWorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No notebook selected</p>
      </div>
    );
  }

  return <NotebookWorkspaceClient resourceId={resourceId} />;
}
