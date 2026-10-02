import { useTranslation } from 'react-i18next';
import WorkspaceFilesPanel from './WorkspaceFilesPanel';
import PDFTab from './PDFTab';
import { type Resource } from '@/types';
import { DetailModal } from '@/components/shared/DetailModal';

interface SidePanelProps {
  resourceId: string;
  resource: Resource;
  isOpen: boolean;
  onClose: () => void;
  notebookWorkspacePath?: string;
  notebookVenvPath?: string;
  onNotebookVenvPathChange?: (path: string) => Promise<void>;
  embedded?: boolean;
}
export default function SidePanel({ resource, isOpen, onClose, notebookWorkspacePath,
  notebookVenvPath, onNotebookVenvPathChange, embedded = false }: SidePanelProps) {
  const { t } = useTranslation();
  if (!isOpen || !['pdf', 'notebook'].includes(resource.type)) return null;
  const content = resource.type === 'pdf' ? <PDFTab /> : <WorkspaceFilesPanel
    workspacePath={notebookWorkspacePath} projectId={resource.project_id} folderId={resource.folder_id}
    venvPath={notebookVenvPath} onVenvPathChange={onNotebookVenvPathChange} />;
  return embedded ? content : <DetailModal title={resource.title} description={t('workspace.side_panel_tabs_aria')}
    onClose={onClose} bodyClassName="overflow-hidden p-0">{content}</DetailModal>;
}
