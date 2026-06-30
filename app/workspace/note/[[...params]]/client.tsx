'use client';

import MarkdownNoteWorkspace from '@/components/notes/MarkdownNoteWorkspace';

interface Props {
  resourceId: string;
  readOnly?: boolean;
  compact?: boolean;
}

export default function NoteWorkspaceClient({ resourceId, readOnly = false, compact = false }: Props) {
  return <MarkdownNoteWorkspace resourceId={resourceId} readOnly={readOnly} compact={compact} />;
}
