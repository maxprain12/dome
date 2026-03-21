'use client';

import NoteWorkspaceClientComponent from '@/components/notes/NoteWorkspaceClient';

interface Props {
  resourceId: string;
}

export default function NoteWorkspaceClient({ resourceId }: Props) {
  return <NoteWorkspaceClientComponent resourceId={resourceId} />;
}
