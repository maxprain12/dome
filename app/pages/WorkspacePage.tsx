import { useSearchParams } from 'react-router-dom';
import WorkspaceClient from '@/workspace/[[...params]]/client';

export default function WorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || '';
  const pageParam = searchParams.get('page');
  const parsedPage = pageParam ? parseInt(pageParam, 10) : undefined;
  const initialPage = parsedPage != null && !Number.isNaN(parsedPage) && parsedPage >= 1 ? parsedPage : undefined;

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No resource selected</p>
      </div>
    );
  }

  return <WorkspaceClient resourceId={resourceId} initialPage={initialPage} />;
}
