'use client';

import NoteWorkspaceClientComponent from '@/components/notes/NoteWorkspaceClient';

interface Props {
  resourceId: string;
  readOnly?: boolean;
  compact?: boolean;
}

export default function NoteWorkspaceClient({ resourceId, readOnly = false, compact = false }: Props) {
  return <NoteWorkspaceClientComponent resourceId={resourceId} readOnly={readOnly} compact={compact} />;
}
