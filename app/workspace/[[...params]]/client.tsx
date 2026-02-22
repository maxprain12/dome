'use client';

import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';

interface WorkspaceClientProps {
  resourceId: string;
  initialPage?: number;
}

export default function WorkspaceClient({ resourceId, initialPage }: WorkspaceClientProps) {
  return <WorkspaceLayout resourceId={resourceId} initialPage={initialPage} />;
}
