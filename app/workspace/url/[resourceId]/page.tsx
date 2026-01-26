import URLWorkspaceClient from './client';

// For dynamic routes with static export, we need this function
// Return at least one param to satisfy Next.js static export requirements
// Additional routes are generated at runtime in Electron
export function generateStaticParams() {
  return [{ resourceId: '_' }];
}

export default function URLWorkspacePage({ params }: { params: { resourceId: string } }) {
  return <URLWorkspaceClient resourceId={params.resourceId} />;
}
