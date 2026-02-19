import { useSearchParams } from 'react-router-dom';
import DocxWorkspaceClient from '@/workspace/docx/[[...params]]/client';

export default function DocxWorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No document selected</p>
      </div>
    );
  }

  return <DocxWorkspaceClient resourceId={resourceId} />;
}
