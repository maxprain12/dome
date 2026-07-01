/** Shared context-menu items for resources/folders (sidebar + folder tab view). */

import { useTranslation } from 'react-i18next';
import {
  Pencil,
  Trash2,
  FolderInput,
  FolderPlus,
  FolderOpen,
  PanelRightOpen,
  Maximize2,
  Palette,
} from 'lucide-react';

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
};

export default function ResourceContextMenuItems({
  options,
  actions,
  onDismiss,
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
      <div className="dome-folder-view__row-menu-divider" />
      {menuItem(<Trash2 className="size-3" />, t('folder.delete'), actions.onDelete, true)}
    </>
  );
}
