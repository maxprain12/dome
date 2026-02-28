import { useSearchParams } from 'react-router-dom';
import NoteWorkspaceLayout from '@/workspace/note/NoteWorkspaceLayout';

export default function NoteWorkspacePage() {
  const [searchParams] = useSearchParams();
  const resourceId = searchParams.get('id') || null;

  return <NoteWorkspaceLayout initialNoteId={resourceId} />;
}
