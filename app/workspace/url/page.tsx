import { Suspense } from 'react';
import URLWorkspaceClientWrapper from './wrapper';

export default function URLWorkspacePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>Loading...</div>}>
      <URLWorkspaceClientWrapper />
    </Suspense>
  );
}
