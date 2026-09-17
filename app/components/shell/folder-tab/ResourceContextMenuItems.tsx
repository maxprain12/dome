/** Shared context-menu items for resources/folders (sidebar + folder tab view). */

import type { ComponentType, ReactNode } from 'react';
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
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import type { Resource } from '@/lib/hooks/useResources';
import { showToast } from '@/lib/store/useToastStore';
import { explorerModHint } from '@/lib/workspace/explorerKeyboard';

export type ResourceContextMenuActions = {
  onRename: () => void;
  onMoveToFolder?: () => void;
  onMoveToProject: () => void;
  onDelete: () => void;
  onOpenInSplit?: () => void;
  onOpenInWindow?: () => void;
  onChangeColor?: () => void;
  onNewSubfolder?: () => void;
  onPreview?: () => void;
  onOpen?: () => void;
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
  resource?: Resource;
  variant?: 'dropdown' | 'context';
};

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);

type ItemProps = {
  variant?: 'default' | 'destructive';
  onClick?: (event: React.MouseEvent) => void;
  className?: string;
  children?: ReactNode;
};

async function resolveResourcePath(resourceId: string): Promise<string | null> {
  try {
    const res = await window.electron?.resource?.getFilePath(resourceId);
    if (res?.success && typeof res.data === 'string') return res.data;
  } catch {
    /* fall through */
  }
  return null;
}

export default function ResourceContextMenuItems({
  options,
  actions,
  onDismiss,
  resource,
  variant = 'dropdown',
}: ResourceContextMenuItemsProps) {
  const { t } = useTranslation();
  const { isFolder, isNote, canOpenInSplit } = options;
  const Item = (variant === 'context' ? ContextMenuItem : DropdownMenuItem) as ComponentType<ItemProps>;
  const Separator = variant === 'context' ? ContextMenuSeparator : DropdownMenuSeparator;
  const Shortcut = variant === 'context' ? ContextMenuShortcut : DropdownMenuShortcut;
  const mod = explorerModHint(typeof navigator === 'undefined' ? undefined : navigator.platform);

  const menuItem = (
    icon: ReactNode,
    label: string,
    action: () => void,
    extra?: { danger?: boolean; shortcut?: string },
  ) => (
    <Item
      variant={extra?.danger ? 'destructive' : 'default'}
      onClick={(e) => {
        e.stopPropagation();
        onDismiss();
        action();
      }}
      className="dome-folder-view__row-menu-item"
    >
      {icon} {label}
      {extra?.shortcut ? <Shortcut>{extra.shortcut}</Shortcut> : null}
    </Item>
  );

  const revealLabel = IS_MAC ? t('folder.reveal_in_finder') : t('folder.reveal_in_explorer');

  const handleReveal = async () => {
    if (!resource) return;
    const abs = await resolveResourcePath(resource.id);
    if (!abs) {
      showToast('warning', t('folder.no_file_on_disk'));
      return;
    }
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
      {actions.onOpen
        ? menuItem(<HugeiconsIcon icon={FolderOpenIcon} />, t('folder.open'), actions.onOpen)
        : null}
      {actions.onPreview
        ? menuItem(
            <HugeiconsIcon icon={ViewIcon} />,
            t('folder.quickLook'),
            actions.onPreview,
            { shortcut: t('folder.shortcutSpace') },
          )
        : null}
      {menuItem(
        <HugeiconsIcon icon={PencilEdit02Icon} />,
        t('folder.rename'),
        actions.onRename,
        { shortcut: t('folder.shortcutF2') },
      )}
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
          <Separator />
          {menuItem(<HugeiconsIcon icon={FolderSymlinkIcon} />, revealLabel, () => {
            void handleReveal();
          })}
          {!isFolder
            ? menuItem(
                <HugeiconsIcon icon={ExternalLinkIcon} />,
                t('folder.open_with_system'),
                () => {
                  void handleOpenWithSystem();
                },
              )
            : null}
          {menuItem(<HugeiconsIcon icon={ClipboardCopyIcon} />, t('folder.copy_path'), () => {
            void handleCopyPath();
          })}
          {menuItem(
            <HugeiconsIcon icon={CopyPlusIcon} />,
            t('folder.duplicate'),
            () => {
              void handleDuplicate();
            },
            { shortcut: `${mod}D` },
          )}
        </>
      ) : null}
      <Separator />
      {menuItem(
        <HugeiconsIcon icon={Delete02Icon} />,
        t('folder.delete'),
        actions.onDelete,
        { danger: true, shortcut: t('folder.shortcutDelete') },
      )}
    </>
  );
}
