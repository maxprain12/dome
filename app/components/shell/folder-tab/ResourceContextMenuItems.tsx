/** Shared context-menu items for resources/folders (sidebar + folder tab view). */

import { useTranslation } from 'react-i18next';
import {
  Pencil,
  Trash2,
  FolderInput,
  FolderPlus,
  FolderOpen,
  FolderSymlink,
  ExternalLink,
  ClipboardCopy,
  CopyPlus,
  PanelRightOpen,
  Maximize2,
  Palette,
} from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { showToast } from '@/lib/store/useToastStore';

export type ResourceContextMenuActions = {
  onRename: () => void;
  onMoveToFolder?: () => void;
  onMoveToProject: () => void;
  onDelete: () => void;
  onOpenInSplit?: () => void;
  onOpenInWindow?: () => void;
  onChangeColor?: () => void;
  onNewSubfolder?: () => void;
};

export type ResourceContextMenuOptions = {
  isFolder: boolean;
  isNote?: boolean;
  canOpenInSplit?: boolean;
};

type ResourceContextMenuItemsProps = {
  options: ResourceContextMenuOptions;
  actions: ResourceContextMenuActions;
  onDismiss: () => void;
  /**
   * When provided, filesystem actions are rendered (reveal in Finder, open
   * with the system app, copy path, duplicate) — the workspace mirrors the
   * real filesystem, so these behave like their Finder counterparts.
   */
  resource?: Resource;
};

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

async function resolveResourcePath(resourceId: string): Promise<string | null> {
  try {
    const res = await window.electron?.resource?.getFilePath(resourceId);
    if (res?.success && typeof res.data === 'string') return res.data;
  } catch { /* fall through */ }
  return null;
}

export default function ResourceContextMenuItems({
  options,
  actions,
  onDismiss,
  resource,
}: ResourceContextMenuItemsProps) {
  const { t } = useTranslation();
  const { isFolder, isNote, canOpenInSplit } = options;

  const menuItem = (icon: React.ReactNode, label: string, action: () => void, danger = false) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
        action();
      }}
      className={`dome-folder-view__row-menu-item${danger ? ' dome-folder-view__row-menu-item--danger' : ''}`}
    >
      {icon} {label}
    </button>
  );

  const revealLabel = IS_MAC ? t('folder.reveal_in_finder') : t('folder.reveal_in_explorer');

  const handleReveal = async () => {
    if (!resource) return;
    const abs = await resolveResourcePath(resource.id);
    if (!abs) {
      showToast('warning', t('folder.no_file_on_disk'));
      return;
    }
    // Folders open directly; files are highlighted inside their folder.
    if (isFolder) await window.electron?.openPath?.(abs);
    else await window.electron?.showItemInFolder?.(abs);
  };

  const handleOpenWithSystem = async () => {
    if (!resource) return;
    const abs = await resolveResourcePath(resource.id);
    if (!abs) {
      showToast('warning', t('folder.no_file_on_disk'));
      return;
    }
    await window.electron?.openPath?.(abs);
  };

  const handleCopyPath = async () => {
    if (!resource) return;
    const abs = await resolveResourcePath(resource.id);
    if (!abs) {
      showToast('warning', t('folder.no_file_on_disk'));
      return;
    }
    try {
      await navigator.clipboard.writeText(abs);
      showToast('success', t('folder.path_copied'));
    } catch {
      showToast('error', t('common.unknown_error', 'Error'));
    }
  };

  const handleDuplicate = async () => {
    if (!resource) return;
    const res = await window.electron?.resource?.duplicate(resource.id, {
      suffix: t('folder.copy_suffix'),
    });
    if (!res?.success) {
      showToast('error', res?.error || t('common.unknown_error', 'Error'));
    }
  };

  return (
    <>
      {menuItem(<Pencil className="size-3" />, t('folder.rename'), actions.onRename)}
      {!isFolder && actions.onOpenInSplit && canOpenInSplit
        ? menuItem(
            <PanelRightOpen className="size-3" />,
            t('focused_editor.open_reference', 'Abrir como referencia'),
            actions.onOpenInSplit,
          )
        : null}
      {!isFolder && actions.onOpenInWindow && isNote
        ? menuItem(
            <Maximize2 className="size-3" />,
            t('focused_editor.popout', 'Abrir en ventana'),
            actions.onOpenInWindow,
          )
        : null}
      {isFolder && actions.onChangeColor
        ? menuItem(
            <Palette className="size-3" />,
            t('folder.changeColor', 'Cambiar color'),
            actions.onChangeColor,
          )
        : null}
      {actions.onMoveToFolder
        ? menuItem(
            <FolderOpen className="size-3" />,
            t('selection.move_to_folder'),
            actions.onMoveToFolder,
          )
        : null}
      {menuItem(<FolderInput className="size-3" />, t('selection.move_to_project'), actions.onMoveToProject)}
      {isFolder && actions.onNewSubfolder
        ? menuItem(<FolderPlus className="size-3" />, t('folder.newFolderBtn'), actions.onNewSubfolder)
        : null}
      {resource ? (
        <>
          <div className="dome-folder-view__row-menu-divider" />
          {menuItem(<FolderSymlink className="size-3" />, revealLabel, () => void handleReveal())}
          {!isFolder
            ? menuItem(
                <ExternalLink className="size-3" />,
                t('folder.open_with_system'),
                () => void handleOpenWithSystem(),
              )
            : null}
          {menuItem(<ClipboardCopy className="size-3" />, t('folder.copy_path'), () => void handleCopyPath())}
          {menuItem(<CopyPlus className="size-3" />, t('folder.duplicate'), () => void handleDuplicate())}
        </>
      ) : null}
      <div className="dome-folder-view__row-menu-divider" />
      {menuItem(<Trash2 className="size-3" />, t('folder.delete'), actions.onDelete, true)}
    </>
  );
}
