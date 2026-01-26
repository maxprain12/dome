'use client';

import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';

interface WorkspaceClientProps {
  resourceId: string;
}

export default function WorkspaceClient({ resourceId }: WorkspaceClientProps) {
  return <WorkspaceLayout resourceId={resourceId} />;
}
