import { useSearchParams } from 'react-router-dom';
import YouTubeWorkspaceClient from '@/workspace/youtube/client';

export default function YouTubeWorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || '';

  if (!resourceId) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <p style={{ color: 'var(--secondary-text)' }}>No video selected</p>
      </div>
    );
  }

  return <YouTubeWorkspaceClient resourceId={resourceId} />;
}
