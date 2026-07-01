/** Unified filesystem list row for folders and files in FolderTabView. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Check, Folder, MoreVertical, X } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import ColorPickerPopover from './ColorPickerPopover';
import { getFolderColor, ResourceTypeIcon, TYPE_LABELS, FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ResourceContextMenuItems from './ResourceContextMenuItems';

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
  const typeColor = isFolder ? (folderColor ?? 'var(--dome-accent)') : 'var(--dome-text-muted)';
  const typeLabel = isFolder ? t('folder.typeFolder', 'Carpeta') : (TYPE_LABELS[item.type] ?? item.type);
  const timeAgo = item.updated_at
    ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
    : '—';

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
          <input
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
            <Folder className="size-4" strokeWidth={1.75} style={{ fill: 'color-mix(in srgb, currentColor 16%, transparent)' }} />
          ) : (
            <ResourceTypeIcon type={item.type} name={item.title} />
          )}
        </span>

        {renaming ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
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
            <button type="button" onClick={commitRename} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--confirm">
              <Check className="size-3.5" />
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--cancel">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="dome-fs-tree-row__title-wrap">
            <button
              type="button"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  e.preventDefault();
                  onToggleSelect(e);
                  return;
                }
                onOpen();
              }}
              className={`dome-fs-tree-name truncate${isFolder ? ' dome-fs-tree-name--folder' : ''}`}
            >
              {searchQuery ? highlightName(displayTitle, searchQuery) : displayTitle}
            </button>
            <span className="dome-folder-view__type-badge" title={typeLabel}>
              {typeLabel}
            </span>
          </div>
        )}
      </div>

      <span className="dome-fs-tree-row__modified tabular-nums">
        {timeAgo}
      </span>

      <div className="dome-fs-tree-row__actions">
        {(hovered || menuOpen) && !renaming ? (
          <button
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
            <MoreVertical className="size-3.5" />
          </button>
        ) : (
          <span className="size-[26px]" aria-hidden />
        )}
      </div>

      {menuOpen && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="menu"
              tabIndex={-1}
              className="dome-folder-view__row-menu"
              style={{ top: menuPos.top, right: menuPos.right }}
              onMouseDown={(e) => e.stopPropagation()}
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
            </div>,
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
