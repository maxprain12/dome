/** Unified filesystem list row for folders and files in FolderTabView. */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, Folder01Icon, MoreVerticalIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SafeText } from '@/components/shared/SafeText';
import type { Resource } from '@/lib/hooks/useResources';
import { formatRelativePair } from '@/lib/utils/formatting';
import ColorPickerPopover from './ColorPickerPopover';
import { getFolderColor, ResourceTypeIcon, FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ResourceContextMenuItems from './ResourceContextMenuItems';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { highlightSnippet } from './FolderItemPreview';
import { resourceTypeI18nKey } from '@/lib/workspace/explorerTypeLabels';
import { isExplorerMultiSelectEvent } from '@/lib/workspace/explorerSelection';
import { cn } from '@/lib/utils';

export default function FolderListRow({
  item,
  isFolder,
  isLast,
  onOpen,
  onDelete,
  onRename,
  onChangeColor,
  onMoveToProject,
  onMoveToFolder,
  onOpenInSplit,
  onOpenInWindow,
  onNewSubfolder,
  onPreview,
  selected,
  showSelectionChrome,
  onToggleSelect,
  searchQuery,
  searchFocused,
  rowRef,
  dropActive,
  dragging,
  renameArmed,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  item: Resource;
  isFolder: boolean;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
  onChangeColor?: (color: string) => void;
  onMoveToProject: () => void;
  onMoveToFolder?: () => void;
  onOpenInSplit?: () => void;
  onOpenInWindow?: () => void;
  onNewSubfolder?: () => void;
  onPreview?: () => void;
  selected: boolean;
  showSelectionChrome: boolean;
  onToggleSelect: (event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => void;
  searchQuery?: string;
  searchFocused?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
  dropActive?: boolean;
  dragging?: boolean;
  renameArmed?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title ?? '');
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const startRenaming = () => {
    setRenaming(true);
    setRenameValue(item.title ?? '');
    requestAnimationFrame(() => renameRef.current?.focus());
  };

  useEffect(() => {
    if (!renameArmed) return;
    startRenaming();
  }, [renameArmed]);

  const folderColor = isFolder ? getFolderColor(item) : undefined;
  const typeColor = isFolder ? (folderColor ?? 'var(--primary)') : 'var(--muted-foreground)';
  const typeLabel = t(resourceTypeI18nKey(item.type, isFolder));
  const timePair = item.updated_at
    ? formatRelativePair(
      typeof item.updated_at === 'number'
        ? item.updated_at
        : new Date(item.updated_at).getTime(),
    )
    : { short: '—', full: '—' };

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.title) onRename(trimmed);
    setRenaming(false);
  };

  const openColorPicker = () => {
    if (!menuBtnRef.current) return;
    const rect = menuBtnRef.current.getBoundingClientRect();
    const popoverWidth = 220;
    const left = Math.min(
      Math.max(8, rect.right - popoverWidth),
      window.innerWidth - popoverWidth - 8,
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
    setColorPickerPos({ top, left });
  };

  const displayTitle = item.title || t('folder.untitled');
  const rowClass = cn(
    'dome-fs-tree-row',
    searchFocused && 'dome-fs-tree-row--focused',
    selected && 'dome-fs-tree-row--selected',
    menuOpen && 'dome-fs-tree-row--menu-open',
    dropActive && 'dome-fs-tree-row--drop-target',
    dragging && 'dome-fs-tree-row--dragging',
    isLast && 'dome-fs-tree-row--last',
  );

  const menuItems = (variant: 'dropdown' | 'context', onDismiss: () => void) => (
    <ResourceContextMenuItems
      resource={item}
      variant={variant}
      options={{
        isFolder,
        isNote: item.type === 'note',
        canOpenInSplit: Boolean(onOpenInSplit),
      }}
      actions={{
        onOpen,
        onPreview,
        onRename: startRenaming,
        onOpenInSplit,
        onOpenInWindow,
        onChangeColor: isFolder && onChangeColor ? openColorPicker : undefined,
        onMoveToFolder,
        onMoveToProject,
        onNewSubfolder: isFolder ? onNewSubfolder : undefined,
        onDelete,
      }}
      onDismiss={onDismiss}
    />
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={rowRef}
            className={rowClass}
            aria-selected={selected}
            draggable={!renaming}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onContextMenu={() => {
              if (!selected) onToggleSelect({});
            }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onDragEnd={onDragEnd}
            onDoubleClick={(e) => {
              if (renaming) return;
              e.preventDefault();
              onOpen();
            }}
          />
        }
      >
        <div className="dome-fs-tree-row__name-cell">
          {showSelectionChrome ? (
            <span className="dome-fs-tree-row__check-slot">
              {selected || hovered ? (
                <Checkbox
                  checked={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect({ metaKey: true });
                  }}
                  aria-label={selected ? t('selection.deselect') : t('common.select')}
                  className="dome-fs-tree-row__checkbox"
                />
              ) : null}
            </span>
          ) : null}

          <span className="dome-fs-tree-row__icon" style={{ color: typeColor }}>
            {isFolder ? (
              <HugeiconsIcon icon={Folder01Icon} className="size-4" strokeWidth={1.75} style={{ fill: 'color-mix(in srgb, currentColor 16%, transparent)' }} />
            ) : (
              <ResourceTypeIcon type={item.type} name={item.title} />
            )}
          </span>

          {renaming ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                ref={renameRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                aria-label={t('ui.rename', 'Rename')}
                className="dome-fs-tree-row__rename-input"
              />
              <Button type="button" onClick={commitRename} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--confirm">
                <HugeiconsIcon icon={CheckIcon} className="size-3.5" />
              </Button>
              <Button type="button" onClick={() => setRenaming(false)} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--cancel">
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </Button>
            </div>
          ) : (
            <div className="dome-fs-tree-row__title-wrap">
              <Button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isExplorerMultiSelectEvent(e)) {
                    onToggleSelect(e);
                    return;
                  }
                  onOpen();
                }}
                className={`dome-fs-tree-name min-w-0${isFolder ? ' dome-fs-tree-name--folder' : ''}`}
                title={displayTitle}
              >
                <SafeText className="block" title={displayTitle}>
                  {searchQuery ? highlightSnippet(displayTitle, searchQuery) : displayTitle}
                </SafeText>
              </Button>
              <span className="dome-folder-view__type-badge" title={typeLabel}>
                {typeLabel}
              </span>
            </div>
          )}
        </div>

        <SafeText
          className="dome-fs-tree-row__modified tabular-nums"
          title={timePair.full}
        >
          {timePair.short}
        </SafeText>

        <div className="dome-fs-tree-row__actions">
          {(hovered || menuOpen) && !renaming ? (
            <DropdownMenu onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger
                render={
                  <Button
                    ref={menuBtnRef}
                    type="button"
                    className="dome-fs-tree-row__menu-btn"
                    aria-label={t('folder.rowActions', 'Acciones')}
                    onClick={(e) => e.stopPropagation()}
                  />
                }
              >
                <HugeiconsIcon icon={MoreVerticalIcon} className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="dome-folder-view__row-menu w-auto">
                {menuItems('dropdown', () => setMenuOpen(false))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="size-[26px]" aria-hidden />
          )}
        </div>

        {colorPickerPos && onChangeColor ? (
          <ColorPickerPopover
            pos={colorPickerPos}
            currentColor={folderColor?.startsWith('#') ? folderColor : FOLDER_COLOR_DEFAULT}
            onSave={onChangeColor}
            onClose={() => setColorPickerPos(null)}
          />
        ) : null}
      </ContextMenuTrigger>
      <ContextMenuContent className="dome-folder-view__row-menu w-auto">
        {menuItems('context', () => undefined)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
