import { Suspense } from 'react';
import WorkspaceClientWrapper from './wrapper';

// For optional catch-all routes with static export, return empty to allow base path
export function generateStaticParams() {
  return [{ params: [] }];
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>Loading...</div>}>
      <WorkspaceClientWrapper />
    </Suspense>
  );
}
