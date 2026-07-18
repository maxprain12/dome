/** Unified filesystem list row for folders and files in FolderTabView. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CheckIcon, Folder01Icon, MoreVerticalIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SafeText } from '@/components/shared/SafeText';
import type { Resource } from '@/lib/hooks/useResources';
import { formatRelativePair } from '@/lib/utils/formatting';
import ColorPickerPopover from './ColorPickerPopover';
import { getFolderColor, ResourceTypeIcon, TYPE_LABELS, FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ResourceContextMenuItems from './ResourceContextMenuItems';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

function highlightName(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > lastIndex) parts.push(text.slice(lastIndex, idx));
    parts.push(
      <mark key={idx} className="dome-folder-view__search-mark">
        {match[0]}
      </mark>,
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

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
  selected,
  showSelectionChrome,
  onToggleSelect,
  searchQuery,
  searchFocused,
  rowRef,
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
  selected: boolean;
  showSelectionChrome: boolean;
  onToggleSelect: (e: React.MouseEvent) => void;
  searchQuery?: string;
  searchFocused?: boolean;
  rowRef?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title ?? '');
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const startRenaming = () => {
    setRenaming(true);
    setRenameValue(item.title ?? '');
    requestAnimationFrame(() => renameRef.current?.focus());
  };

  const folderColor = isFolder ? getFolderColor(item) : undefined;
  const typeColor = isFolder ? (folderColor ?? 'var(--primary)') : 'var(--muted-foreground)';
  const typeLabel = isFolder ? t('folder.typeFolder', 'Carpeta') : (TYPE_LABELS[item.type] ?? item.type);
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

  const rowClass = [
    'dome-fs-tree-row',
    searchFocused ? 'dome-fs-tree-row--focused' : '',
    selected ? 'dome-fs-tree-row--selected' : '',
    menuOpen ? 'dome-fs-tree-row--menu-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={rowRef}
      className={rowClass}
      style={isLast ? { borderBottom: 'none' } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        if (renaming) return;
        e.preventDefault();
        setMenuPos({ top: e.clientY, right: window.innerWidth - e.clientX });
        setMenuOpen(true);
      }}
    >
      <div className="dome-fs-tree-row__name-cell">
        {showSelectionChrome ? (
          <Input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
            className="dome-fs-tree-row__checkbox rounded border shrink-0"
            aria-label={t('selection.deselect')}
          />
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
                if (e.metaKey || e.ctrlKey) {
                  e.preventDefault();
                  onToggleSelect(e);
                  return;
                }
                onOpen();
              }}
              className={`dome-fs-tree-name min-w-0${isFolder ? ' dome-fs-tree-name--folder' : ''}`}
              title={displayTitle}
            >
              <SafeText className="block" title={displayTitle}>
                {searchQuery ? highlightName(displayTitle, searchQuery) : displayTitle}
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
          <Button
            ref={menuBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen && menuBtnRef.current) {
                const rect = menuBtnRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              }
              setMenuOpen((v) => !v);
            }}
            className="dome-fs-tree-row__menu-btn"
            aria-label={t('folder.rowActions', 'Acciones')}
          >
            <HugeiconsIcon icon={MoreVerticalIcon} className="size-3.5" />
          </Button>
        ) : (
          <span className="size-[26px]" aria-hidden />
        )}
      </div>

      {menuOpen && menuPos
        ? createPortal(
            <DropdownMenu open onOpenChange={(open) => { if (!open) setMenuOpen(false); }}>
              <DropdownMenuTrigger
                nativeButton={false}
                render={
                  <span
                    className="pointer-events-none fixed size-px"
                    style={{ top: menuPos.top, right: menuPos.right }}
                    aria-hidden
                  />
                }
              />
              <DropdownMenuContent
                align="end"
                side="bottom"
                sideOffset={0}
                positionMethod="fixed"
                className="dome-folder-view__row-menu w-auto"
              >
                <ResourceContextMenuItems
                  resource={item}
                  options={{
                    isFolder,
                    isNote: item.type === 'note',
                    canOpenInSplit: Boolean(onOpenInSplit),
                  }}
                  actions={{
                    onRename: startRenaming,
                    onOpenInSplit,
                    onOpenInWindow,
                    onChangeColor: isFolder && onChangeColor ? openColorPicker : undefined,
                    onMoveToFolder,
                    onMoveToProject,
                    onNewSubfolder: isFolder ? onNewSubfolder : undefined,
                    onDelete,
                  }}
                  onDismiss={() => setMenuOpen(false)}
                />
              </DropdownMenuContent>
            </DropdownMenu>,
            document.body,
          )
        : null}

      {colorPickerPos && onChangeColor ? (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={folderColor?.startsWith('#') ? folderColor : FOLDER_COLOR_DEFAULT}
          onSave={onChangeColor}
          onClose={() => setColorPickerPos(null)}
        />
      ) : null}
    </div>
  );
}
