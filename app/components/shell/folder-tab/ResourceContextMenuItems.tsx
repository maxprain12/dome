/** Shared context-menu items for resources/folders (sidebar + folder tab view). */

import { useTranslation } from 'react-i18next';
import {
  PencilEdit02Icon,
  Delete02Icon,
  FolderInputIcon,
  FolderAddIcon,
  FolderOpenIcon,
  FolderSymlinkIcon,
  ExternalLinkIcon,
  ClipboardCopyIcon,
  CopyPlusIcon,
  PanelRightOpenIcon,
  Maximize02Icon,
  PaintBoardIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
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
    <DropdownMenuItem
      variant={danger ? 'destructive' : 'default'}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
        action();
      }}
      className="dome-folder-view__row-menu-item"
    >
      {icon} {label}
    </DropdownMenuItem>
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
      {menuItem(<HugeiconsIcon icon={PencilEdit02Icon} />, t('folder.rename'), actions.onRename)}
      {!isFolder && actions.onOpenInSplit && canOpenInSplit
        ? menuItem(
            <HugeiconsIcon icon={PanelRightOpenIcon} />,
            t('focused_editor.open_reference', 'Abrir como referencia'),
            actions.onOpenInSplit,
          )
        : null}
      {!isFolder && actions.onOpenInWindow && isNote
        ? menuItem(
            <HugeiconsIcon icon={Maximize02Icon} />,
            t('focused_editor.popout', 'Abrir en ventana'),
            actions.onOpenInWindow,
          )
        : null}
      {isFolder && actions.onChangeColor
        ? menuItem(
            <HugeiconsIcon icon={PaintBoardIcon} />,
            t('folder.changeColor', 'Cambiar color'),
            actions.onChangeColor,
          )
        : null}
      {actions.onMoveToFolder
        ? menuItem(
            <HugeiconsIcon icon={FolderOpenIcon} />,
            t('selection.move_to_folder'),
            actions.onMoveToFolder,
          )
        : null}
      {menuItem(<HugeiconsIcon icon={FolderInputIcon} />, t('selection.move_to_project'), actions.onMoveToProject)}
      {isFolder && actions.onNewSubfolder
        ? menuItem(<HugeiconsIcon icon={FolderAddIcon} />, t('folder.newFolderBtn'), actions.onNewSubfolder)
        : null}
      {resource ? (
        <>
          <DropdownMenuSeparator />
          {menuItem(<HugeiconsIcon icon={FolderSymlinkIcon} />, revealLabel, () => void handleReveal())}
          {!isFolder
            ? menuItem(
                <HugeiconsIcon icon={ExternalLinkIcon} />,
                t('folder.open_with_system'),
                () => void handleOpenWithSystem(),
              )
            : null}
          {menuItem(<HugeiconsIcon icon={ClipboardCopyIcon} />, t('folder.copy_path'), () => void handleCopyPath())}
          {menuItem(<HugeiconsIcon icon={CopyPlusIcon} />, t('folder.duplicate'), () => void handleDuplicate())}
        </>
      ) : null}
      <DropdownMenuSeparator />
      {menuItem(<HugeiconsIcon icon={Delete02Icon} />, t('folder.delete'), actions.onDelete, true)}
    </>
  );
}
