import { useSearchParams } from 'react-router-dom';
import NoteWorkspaceClient from '@/workspace/note/[[...params]]/client';

export default function NoteWorkspacePage() {
  const [searchParams] = useSearchParams();
  // Read resource ID from query parameter
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No note selected</p>
      </div>
    );
  }

  return <NoteWorkspaceClient resourceId={resourceId} />;
}
