'use client';

import {
  FolderOpen,
  Trash2,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CanvasWorkflow } from '@/types/canvas';
import type { DomeWorkflowFolder } from '@/types';
import DomeButton from '@/components/ui/DomeButton';
import DomeContextMenu, { type DomeContextMenuItem } from '@/components/ui/DomeContextMenu';
import WorkflowLibraryCard from './WorkflowLibraryCard';
import { DND_WORKFLOW_MIME } from './workflow-library-utils';

interface WorkflowLibraryFolderTreeProps {
  folders: DomeWorkflowFolder[];
  visibleFolders: DomeWorkflowFolder[];
  visibleWorkflows: CanvasWorkflow[];
  expanded: Set<string>;
  dragOverFolderId: string | 'root' | null;
  hubCardVariant: 'editorial' | 'card';
  hubListClass: string;
  deletingId: string | null;
  onToggleExpand: (id: string) => void;
  onSetDragOver: (id: string | 'root' | null) => void;
  onMoveWorkflow: (workflowId: string, folderId: string | null) => void;
  onNewChildFolder: (parentId: string) => void;
  onRenameFolder: (folder: DomeWorkflowFolder) => void;
  onDeleteFolderTarget: (folder: DomeWorkflowFolder) => void;
  onOpenWorkflow: (wf: CanvasWorkflow) => void;
  onExportWorkflow: (wf: CanvasWorkflow) => void;
  onDeleteWorkflow: (id: string) => void;
  onShowAutomations?: (workflowId: string, workflowLabel: string) => void;
}

import { childFolders } from '@/lib/agent-canvas/workflow-library-folders';

function workflowsInFolder(
  visibleWorkflows: CanvasWorkflow[],
  folderId: string,
): CanvasWorkflow[] {
  return visibleWorkflows.filter((w) => w.folderId === folderId).sort((a, b) => b.updatedAt - a.updatedAt);
}

function WorkflowLibraryFolderRow({
  folder,
  depth,
  props,
}: {
  folder: DomeWorkflowFolder;
  depth: number;
  props: WorkflowLibraryFolderTreeProps;
}) {
  const { t } = useTranslation();
  const isOpen = props.expanded.has(folder.id);
  const kids = childFolders(props.visibleFolders, folder.id);
  const wfs = workflowsInFolder(props.visibleWorkflows, folder.id);
  const pad = Math.min(depth * 12, 48);

  const onDragOverRow = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DND_WORKFLOW_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    props.onSetDragOver(folder.id);
  };

  const onDropRow = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DND_WORKFLOW_MIME);
    props.onSetDragOver(null);
    if (id) void props.onMoveWorkflow(id, folder.id);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-2 rounded-xl border p-2 transition-colors"
        style={{
          marginLeft: pad,
          borderColor: props.dragOverFolderId === folder.id ? 'var(--dome-accent)' : 'var(--dome-border)',
          background:
            props.dragOverFolderId === folder.id ? 'var(--dome-accent-bg)' : 'var(--dome-surface)',
        }}
        onDragOver={onDragOverRow}
        onDragLeave={() => props.onSetDragOver(props.dragOverFolderId === folder.id ? null : props.dragOverFolderId)}
        onDrop={onDropRow}
      >
        <DomeButton
          iconOnly
          variant="ghost"
          size="sm"
          aria-label={isOpen ? t('ui.collapse') : t('ui.expand')}
          aria-expanded={isOpen}
          onClick={() => props.onToggleExpand(folder.id)}
        >
          {isOpen ? (
            <ChevronDown className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
          ) : (
            <ChevronRight className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
          )}
        </DomeButton>
        <FolderOpen className="size-4 shrink-0" style={{ color: 'var(--dome-accent)' }} />
        <span className="flex-1 min-w-0 text-sm font-medium break-words" style={{ color: 'var(--dome-text)' }}>
          {folder.name}
        </span>
        <div className="flex items-center gap-1">
          <DomeButton
            iconOnly
            variant="ghost"
            size="sm"
            aria-label={t('filter.new_folder')}
            onClick={() => void props.onNewChildFolder(folder.id)}
          >
            <FolderPlus className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
          </DomeButton>
          <DomeContextMenu
            align="end"
            trigger={
              <DomeButton iconOnly variant="ghost" size="sm" aria-label={t('canvas.workflow_folder_actions')}>
                <MoreHorizontal className="size-4" style={{ color: 'var(--dome-text-muted)' }} />
              </DomeButton>
            }
            items={[
              {
                label: t('canvas.rename_workflow_folder'),
                icon: <Pencil className="size-3.5" />,
                onClick: () => void props.onRenameFolder(folder),
              },
              {
                label: t('canvas.delete_workflow_folder'),
                icon: <Trash2 className="size-3.5" />,
                variant: 'danger',
                onClick: () => props.onDeleteFolderTarget(folder),
              },
            ] as DomeContextMenuItem[]}
          />
        </div>
      </div>
      {isOpen ? (
        <div className="flex flex-col gap-2">
          {kids.map((k) => (
            <WorkflowLibraryFolderRow key={k.id} folder={k} depth={depth + 1} props={props} />
          ))}
          {wfs.length > 0 ? (
            <div className={props.hubListClass} style={{ marginLeft: pad + 8 }}>
              {wfs.map((wf) => (
                <WorkflowLibraryCard
                  key={wf.id}
                  wf={wf}
                  hubCardVariant={props.hubCardVariant}
                  deletingId={props.deletingId}
                  onOpen={props.onOpenWorkflow}
                  onExport={props.onExportWorkflow}
                  onDelete={props.onDeleteWorkflow}
                  onShowAutomations={props.onShowAutomations}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkflowLibraryFolderTree(props: WorkflowLibraryFolderTreeProps) {
  const roots = childFolders(props.visibleFolders, null);

  return (
    <>
      {roots.map((f) => (
        <WorkflowLibraryFolderRow key={f.id} folder={f} depth={0} props={props} />
      ))}
    </>
  );
}
