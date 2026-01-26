import URLWorkspaceClient from './client';

export default function URLWorkspacePage({ params }: { params: { resourceId: string } }) {
  return <URLWorkspaceClient resourceId={params.resourceId} />;
}
