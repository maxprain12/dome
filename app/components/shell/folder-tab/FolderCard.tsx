/** Grid card for a folder or resource inside FolderTabView. */

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckIcon,
  MoreVerticalIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MetaLine, SafeText } from '@/components/shared/SafeText';
import { cn } from '@/lib/utils';
import type { Resource } from '@/lib/hooks/useResources';
import { useResourceVisualPreview, type ResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';
import { isExplorerMultiSelectEvent } from '@/lib/workspace/explorerSelection';
import { FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ColorPickerPopover from './ColorPickerPopover';
import ResourceContextMenuItems from './ResourceContextMenuItems';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  CoverPreviewContent,
  deriveCardPresentation,
  highlightSnippet,
  type CardPresentation,
  type TranslateFn,
} from './FolderItemPreview';

interface FolderCardProps {
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
  onToggleSelect: (event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => void;
  selected: boolean;
  searchQuery?: string;
  searchFocused?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  childCount?: number;
  dropActive?: boolean;
  dragging?: boolean;
  renameArmed?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

function CardChrome({
  renaming,
  hovered,
  menuOpen,
  menu,
}: {
  renaming: boolean;
  hovered: boolean;
  menuOpen: boolean;
  menu: ReactNode;
}) {
  if ((hovered || menuOpen) && !renaming) return menu;
  return null;
}

function FolderFooter({
  renaming,
  renameRef,
  renameValue,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onActivate,
  p,
  searchQuery,
  t,
}: {
  renaming: boolean;
  renameRef: React.RefObject<HTMLInputElement>;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onActivate: (e: React.MouseEvent) => void;
  p: CardPresentation;
  searchQuery?: string;
  t: TranslateFn;
}) {
  if (renaming) {
    return (
      <div className="dome-fs-card__footer">
        <div className="dome-fs-card__rename">
          <Input
            ref={renameRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('ui.rename', 'Rename')}
            className="h-7"
          />
          <Button type="button" variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); onCommitRename(); }} aria-label={t('ui.create')}>
            <HugeiconsIcon icon={CheckIcon} />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); onCancelRename(); }} aria-label={t('ui.cancel')}>
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className="dome-fs-card__footer h-auto min-w-0 w-full shrink whitespace-normal"
      onClick={onActivate}
      aria-label={p.displayTitle}
    >
      <SafeText as="h3" lines={2} className="dome-fs-card__title" title={p.displayTitle}>
        {searchQuery ? highlightSnippet(p.displayTitle, searchQuery) : p.displayTitle}
      </SafeText>
      <MetaLine
        className="dome-fs-card__meta"
        leading={(
          <Badge variant="secondary" className="max-w-full truncate" title={p.typeLabel}>
            {p.typeLabel}
          </Badge>
        )}
        trailing={p.timeAgoShort}
        trailingTitle={p.timeAgoFull}
      />
    </Button>
  );
}

function FolderItemMenus({
  item,
  isFolderCard,
  variant,
  onDismiss,
  startRenaming,
  openColorPicker,
  onOpen,
  onPreview,
  actions,
}: {
  item: Resource;
  isFolderCard: boolean;
  variant: 'dropdown' | 'context';
  onDismiss: () => void;
  startRenaming: () => void;
  openColorPicker: () => void;
  onOpen: () => void;
  onPreview?: () => void;
  actions: Pick<
    FolderCardProps,
    | 'onDelete'
    | 'onChangeColor'
    | 'onMoveToProject'
    | 'onMoveToFolder'
    | 'onOpenInSplit'
    | 'onOpenInWindow'
    | 'onNewSubfolder'
  >;
}) {
  return (
    <ResourceContextMenuItems
      resource={item}
      variant={variant}
      options={{
        isFolder: isFolderCard,
        isNote: item.type === 'note',
        canOpenInSplit: Boolean(actions.onOpenInSplit),
      }}
      actions={{
        onOpen,
        onPreview,
        onRename: startRenaming,
        onOpenInSplit: actions.onOpenInSplit,
        onOpenInWindow: actions.onOpenInWindow,
        onChangeColor: isFolderCard && actions.onChangeColor ? openColorPicker : undefined,
        onMoveToFolder: actions.onMoveToFolder,
        onMoveToProject: actions.onMoveToProject,
        onNewSubfolder: isFolderCard ? actions.onNewSubfolder : undefined,
        onDelete: actions.onDelete,
      }}
      onDismiss={onDismiss}
    />
  );
}

function CardColorPicker({
  folderColor,
  colorPickerPos,
  onChangeColor,
  onClose,
}: {
  folderColor: string | undefined;
  colorPickerPos: { top: number; left: number } | null;
  onChangeColor?: (color: string) => void;
  onClose: () => void;
}) {
  if (!colorPickerPos || !onChangeColor) return null;
  return (
    <ColorPickerPopover
      pos={colorPickerPos}
      currentColor={folderColor?.startsWith('#') ? folderColor : FOLDER_COLOR_DEFAULT}
      onSave={onChangeColor}
      onClose={onClose}
    />
  );
}

/** Root class list for a folder/resource card — extracted for S3776. */
function folderCardRootClassName(opts: {
  isFolderCard: boolean;
  p: CardPresentation;
  searchFocused?: boolean;
  selected: boolean;
  menuOpen: boolean;
  isLast?: boolean;
  dropActive?: boolean;
  dragging?: boolean;
}): string {
  const { isFolderCard, p, searchFocused, selected, menuOpen, isLast, dropActive, dragging } = opts;
  return cn(
    'dome-fs-card',
    isFolderCard ? 'dome-fs-card--folder' : 'dome-fs-card--resource',
    !isFolderCard && 'dome-fs-card--stacked',
    p.isMediaCard && 'dome-fs-card--media',
    p.isSheetCard && 'dome-fs-card--sheet',
    p.isNoteCard && 'dome-fs-card--note',
    p.isPdfCard && 'dome-fs-card--pdf',
    p.artifactTemplate && 'dome-fs-card--artifact-card',
    searchFocused && 'dome-fs-card--focused',
    selected && 'dome-fs-card--selected',
    menuOpen && 'dome-fs-card--menu-open',
    isLast && 'dome-fs-card--last',
    dropActive && 'dome-fs-card--drop-target',
    dragging && 'dome-fs-card--dragging',
    'dome-fs-card--icon',
  );
}

function commitFolderCardRename(
  renameValue: string,
  currentTitle: string | undefined,
  onRename: (next: string) => void,
): void {
  const trimmed = renameValue.trim();
  if (trimmed && trimmed !== currentTitle) onRename(trimmed);
}

function activateFolderCard(
  e: React.MouseEvent,
  renaming: boolean,
  onToggleSelect: (event: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => void,
  onOpen: () => void,
): void {
  if (renaming) return;
  e.stopPropagation();
  if (isExplorerMultiSelectEvent(e)) {
    onToggleSelect(e);
    return;
  }
  onOpen();
}

function colorPickerPosFromButton(btn: HTMLButtonElement): { top: number; left: number } {
  const rect = btn.getBoundingClientRect();
  const popoverWidth = 220;
  const left = Math.min(
    Math.max(8, rect.right - popoverWidth),
    window.innerWidth - popoverWidth - 8,
  );
  const top = Math.min(rect.bottom + 6, window.innerHeight - 120);
  return { top, left };
}

/** Folder / stacked / compact body branches — extracted so FolderCardImpl stays under S3776. */
function FolderCardBody({
  item,
  isFolderCard,
  renaming,
  p,
  visual,
  previewRef,
  chrome,
  stackedFooter,
  onActivate,
}: {
  item: Resource;
  isFolderCard: boolean;
  renaming: boolean;
  p: CardPresentation;
  visual: ResourceVisualPreview;
  previewRef: (node: Element | null) => void;
  chrome: ReactNode;
  stackedFooter: ReactNode;
  onActivate: (e: React.MouseEvent) => void;
}) {
  if (isFolderCard) {
    return (
      <>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
        <div
          className="dome-fs-card__cover dome-fs-card__cover--folder cursor-pointer"
          onClick={onActivate}
        >
          {chrome}
          <CoverPreviewContent item={item} isFolderCard p={p} visual={visual} />
        </div>
        {stackedFooter}
      </>
    );
  }

  if (renaming) return stackedFooter;

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={previewRef as React.Ref<HTMLDivElement>}
        className="dome-fs-card__cover dome-fs-card__cover--resource dome-fs-card__cover--stacked cursor-pointer"
        onClick={onActivate}
      >
        {chrome}
        <CoverPreviewContent item={item} isFolderCard={false} p={p} visual={visual} />
      </div>
      {stackedFooter}
    </>
  );
}

function FolderCardImpl({
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
  onToggleSelect,
  selected,
  searchQuery,
  searchFocused,
  cardRef,
  childCount = 0,
  dropActive,
  dragging,
  renameArmed,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: FolderCardProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.title ?? '');
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renameArmed) return;
    setRenaming(true);
    setRenameValue(item.title ?? '');
    requestAnimationFrame(() => renameRef.current?.focus());
  }, [renameArmed, item.title]);

  const startRenaming = () => {
    setRenaming(true);
    setRenameValue(item.title ?? '');
    requestAnimationFrame(() => renameRef.current?.focus());
  };

  const isFolderCard = isFolder;
  const { preview: visual, ref: previewRef } = useResourceVisualPreview(isFolder ? null : item);
  const p = deriveCardPresentation(item, isFolder, visual, searchQuery, t, childCount);

  const commitRename = () => {
    commitFolderCardRename(renameValue, item.title, onRename);
    setRenaming(false);
  };

  const handleCardActivate = (e: React.MouseEvent) => {
    activateFolderCard(e, renaming, onToggleSelect, onOpen);
  };

  const openColorPicker = () => {
    if (!menuBtnRef.current) return;
    setColorPickerPos(colorPickerPosFromButton(menuBtnRef.current));
  };

  const menuActions = {
    onDelete,
    onChangeColor,
    onMoveToProject,
    onMoveToFolder,
    onOpenInSplit,
    onOpenInWindow,
    onNewSubfolder,
  };

  const chrome = (
    <CardChrome
      renaming={renaming}
      hovered={hovered}
      menuOpen={menuOpen}
      menu={(
        <DropdownMenu onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                ref={menuBtnRef}
                type="button"
                variant="secondary"
                size="icon-xs"
                className="dome-fs-card__menu-btn"
                aria-label={t('folder.rowActions', 'Acciones')}
                title={t('folder.rowActions', 'Acciones')}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <HugeiconsIcon icon={MoreVerticalIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="dome-folder-view__row-menu w-auto">
            <FolderItemMenus
              item={item}
              isFolderCard={isFolderCard}
              variant="dropdown"
              onDismiss={() => setMenuOpen(false)}
              startRenaming={startRenaming}
              openColorPicker={openColorPicker}
              onOpen={onOpen}
              onPreview={onPreview}
              actions={menuActions}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    />
  );

  const stackedFooter = (
    <FolderFooter
      renaming={renaming}
      renameRef={renameRef}
      renameValue={renameValue}
      onRenameValueChange={setRenameValue}
      onCommitRename={commitRename}
      onCancelRename={() => setRenaming(false)}
      onActivate={handleCardActivate}
      p={p}
      searchQuery={searchQuery}
      t={t}
    />
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            ref={cardRef}
            className={folderCardRootClassName({
              isFolderCard,
              p,
              searchFocused,
              selected,
              menuOpen,
              isLast,
              dropActive,
              dragging,
            })}
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
        <FolderCardBody
          item={item}
          isFolderCard={isFolderCard}
          renaming={renaming}
          p={p}
          visual={visual}
          previewRef={previewRef}
          chrome={chrome}
          stackedFooter={stackedFooter}
          onActivate={handleCardActivate}
        />

        <CardColorPicker
          folderColor={p.folderColor}
          colorPickerPos={colorPickerPos}
          onChangeColor={onChangeColor}
          onClose={() => setColorPickerPos(null)}
        />
      </ContextMenuTrigger>
      <ContextMenuContent className="dome-folder-view__row-menu w-auto">
        <FolderItemMenus
          item={item}
          isFolderCard={isFolderCard}
          variant="context"
          onDismiss={() => undefined}
          startRenaming={startRenaming}
          openColorPicker={openColorPicker}
          onOpen={onOpen}
          onPreview={onPreview}
          actions={menuActions}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

const FolderCard = memo(FolderCardImpl, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.title === next.item.title &&
  prev.item.updated_at === next.item.updated_at &&
  prev.item.content === next.item.content &&
  prev.item.content_text === next.item.content_text &&
  prev.item.thumbnail_data === next.item.thumbnail_data &&
  prev.isFolder === next.isFolder &&
  prev.selected === next.selected &&
  prev.searchFocused === next.searchFocused &&
  prev.searchQuery === next.searchQuery &&
  prev.childCount === next.childCount &&
  prev.dropActive === next.dropActive &&
  prev.dragging === next.dragging &&
  prev.renameArmed === next.renameArmed
));

export default FolderCard;
