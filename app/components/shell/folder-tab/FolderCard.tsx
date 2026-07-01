/** Grid card for a folder or resource inside FolderTabView. Shows thumbnail + content snippet. */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Check, FileText, Folder, MoreVertical, X } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from '@/lib/chat/artifactStorageShim';
import { getFolderColor, TYPE_LABELS, FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ColorPickerPopover from './ColorPickerPopover';
import ResourceContextMenuItems from './ResourceContextMenuItems';

const SNIPPET_MAX = 180;

/**
 * Build the srcdoc for an artifact preview thumbnail: inject the storage shim
 * and the artifact's `DOME_DATA` so the template renders its real content, then
 * the template HTML. Rendered in a sandboxed, non-interactive scaled iframe.
 */
function buildArtifactThumbSrcDoc(template: string, data: Record<string, unknown> | null): string {
  const dataJson = JSON.stringify(data ?? {}).replace(/</g, '\\u003c');
  const inject =
    `<script>${DOME_IFRAME_STORAGE_SHIM_SCRIPT};` +
    `window.DOME_DATA=${dataJson};` +
    `window.__dome_updateState=function(){};` +
    `window.__dome_collectState=function(){return window.DOME_DATA;};</script>`;
  if (/<head[^>]*>/i.test(template)) return template.replace(/<head[^>]*>/i, (m) => m + inject);
  if (/<html[^>]*>/i.test(template)) return template.replace(/<html[^>]*>/i, (m) => m + inject);
  return inject + template;
}

/** Non-interactive, scaled-down live render of a persisted artifact. */
function ArtifactThumb({ template, data }: { template: string; data: Record<string, unknown> | null }) {
  const srcDoc = useMemo(() => buildArtifactThumbSrcDoc(template, data), [template, data]);
  return (
    <iframe
      title="artifact-preview"
      className="dome-fs-card__artifact-thumb"
      sandbox="allow-scripts"
      scrolling="no"
      srcDoc={srcDoc}
      tabIndex={-1}
      aria-hidden
    />
  );
}

function stripHtml(input: string): string {
  if (!input) return '';
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Recover readable text from a note's stored content, which may be Tiptap JSON. */
function plainTextFromContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parts: string[] = [];
      const walk = (node: unknown) => {
        if (!node || typeof node !== 'object') return;
        const n = node as { text?: unknown; content?: unknown };
        if (typeof n.text === 'string') parts.push(n.text);
        if (Array.isArray(n.content)) {
          for (const c of n.content) walk(c);
          parts.push(' ');
        }
      };
      walk(JSON.parse(trimmed));
      const text = parts.join('').replace(/\s+/g, ' ').trim();
      if (text) return text;
    } catch {
      /* not JSON — fall through to stripHtml */
    }
  }
  return stripHtml(content);
}

function pickSnippet(item: Resource): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const candidates: Array<unknown> = [
    meta.snippet,
    meta.summary,
    meta.description,
    meta.excerpt,
    meta.preview_text,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  // Prefer the plain-text cache (Markdown vault); never show raw Tiptap JSON.
  if (typeof item.content_text === 'string' && item.content_text.trim()) {
    return item.content_text.trim().slice(0, SNIPPET_MAX);
  }
  const content = item.content;
  if (typeof content === 'string' && content.trim()) {
    const text = plainTextFromContent(content);
    if (text) return text.slice(0, SNIPPET_MAX);
  }
  return '';
}

function pickThumbnail(item: Resource): string | null {
  if (item.thumbnail_data) return item.thumbnail_data;
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const candidates: Array<unknown> = [
    meta.preview_image,
    meta.thumbnail,
    meta.og_image,
    meta.cover,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (item.type === 'image' && item.file_path) return item.file_path;
  return null;
}

function highlightSnippet(text: string, query: string): ReactNode {
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
  onToggleSelect,
  selected,
  showSelectionChrome,
  searchQuery,
  searchFocused,
  cardRef,
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
  onToggleSelect: (e: React.MouseEvent) => void;
  selected: boolean;
  showSelectionChrome: boolean;
  searchQuery?: string;
  searchFocused?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
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

  // Lazy content preview (PDF first page, artifact mini-visual, image thumbnail
  // or text snippet) — the lightweight list payload omits content/thumbnails,
  // so they are fetched per-card on demand via this hook.
  const { preview: visual, ref: previewRef } = useResourceVisualPreview(isFolder ? null : item);

  const eagerThumbnail = isFolder ? null : pickThumbnail(item);
  const lazyImage = !isFolder
    ? (visual.imageUrl || (visual.kind === 'pdf' ? visual.pdfDataUrl : null))
    : null;
  const coverImage = eagerThumbnail || lazyImage;
  const isPdfCover = !eagerThumbnail && visual.kind === 'pdf' && !!visual.pdfDataUrl;

  // Artifacts render a real visual thumbnail (the template in a scaled iframe)
  // rather than a code/text excerpt.
  const artifactTemplate = !isFolder && visual.kind === 'artifact' && !visual.failed
    ? (visual.artifact?.template ?? null)
    : null;

  const eagerSnippet = isFolder ? '' : pickSnippet(item);
  const lazySnippet = isFolder
    ? ''
    : (visual.snippet ?? (visual.kind === 'artifact' ? visual.artifact?.snippet ?? '' : ''));
  const snippet = eagerSnippet || lazySnippet;
  // When there is no cover image and no artifact thumbnail, a text excerpt
  // becomes the cover preview; avoid duplicating it in the body in that case.
  const coverShowsSnippet = !isFolder && !coverImage && !artifactTemplate && !!snippet;

  const displayTitle = item.title || t('folder.untitled');
  const isFolderCard = isFolder;

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.title) onRename(trimmed);
    setRenaming(false);
  };

  // Single open/select handler shared by the whole card (cover + body) so a
  // click anywhere opens the resource — not only on the title/snippet area.
  // Interactive children (menu button, checkbox, rename input) stop propagation.
  const handleCardActivate = (e: React.MouseEvent) => {
    if (renaming) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      onToggleSelect(e);
      return;
    }
    onOpen();
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

  const cardClass = [
    'dome-fs-card',
    searchFocused ? 'dome-fs-card--focused' : '',
    selected ? 'dome-fs-card--selected' : '',
    menuOpen ? 'dome-fs-card--menu-open' : '',
    isLast ? 'dome-fs-card--last' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={cardRef}
      className={cardClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        if (renaming) return;
        e.preventDefault();
        setMenuPos({ top: e.clientY, right: window.innerWidth - e.clientX });
        setMenuOpen(true);
      }}
    >
      {/* Cover is a mouse-only convenience target; the body below is the
          keyboard-accessible button (role=button + tabIndex + onKeyDown). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={previewRef as unknown as React.Ref<HTMLDivElement>}
        className={`dome-fs-card__cover cursor-pointer${artifactTemplate ? ' dome-fs-card__cover--artifact' : ''}`}
        onClick={handleCardActivate}
        style={isFolderCard
          ? { background: `color-mix(in srgb, ${typeColor} 12%, var(--dome-surface))` }
          : coverImage
            ? {
                backgroundImage: `url(${coverImage})`,
                ...(isPdfCover ? { backgroundSize: 'contain', backgroundColor: 'var(--dome-surface)' } : {}),
              }
            : undefined}
      >
        {showSelectionChrome ? (
          <span className="dome-fs-card__select">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => {}}
              onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
              className="dome-fs-tree-row__checkbox rounded border"
              aria-label={t('selection.deselect')}
            />
          </span>
        ) : null}

        {isFolderCard ? (
          <Folder
            className="dome-fs-card__cover-icon"
            style={{ color: typeColor }}
            strokeWidth={1.25}
          />
        ) : artifactTemplate ? (
          <ArtifactThumb template={artifactTemplate} data={visual.artifact?.data ?? null} />
        ) : coverImage ? null : coverShowsSnippet ? (
          <p className="dome-fs-card__cover-snippet">
            {searchQuery ? highlightSnippet(snippet, searchQuery) : snippet}
          </p>
        ) : visual.loading ? (
          <div className="dome-fs-card__cover-fallback" style={{ color: typeColor }} aria-hidden>
            <DomeResourceIcon type={item.type} name={item.title} size={28} strokeWidth={1.25} />
          </div>
        ) : (
          <div className="dome-fs-card__cover-fallback" style={{ color: typeColor }}>
            {item.type === 'note' || item.type === 'notebook' ? (
              <FileText className="size-7" strokeWidth={1.25} />
            ) : (
              <DomeResourceIcon type={item.type} name={item.title} size={28} strokeWidth={1.25} />
            )}
          </div>
        )}

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
            className="dome-fs-card__menu-btn"
            aria-label={t('folder.rowActions', 'Acciones')}
            title={t('folder.rowActions', 'Acciones')}
          >
            <MoreVertical className="size-3.5" />
          </button>
        ) : null}
      </div>

      {renaming ? (
        <div className="dome-fs-card__body">
          <div className="dome-fs-card__rename">
            <input
              ref={renameRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={t('ui.rename', 'Rename')}
              className="dome-fs-tree-row__rename-input"
            />
            <button type="button" onClick={(e) => { e.stopPropagation(); commitRename(); }} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--confirm">
              <Check className="size-3.5" />
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setRenaming(false); }} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--cancel">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="dome-fs-card__body"
          onClick={handleCardActivate}
          aria-label={displayTitle}
        >
          <h3 className="dome-fs-card__title" title={displayTitle}>
            {searchQuery ? highlightSnippet(displayTitle, searchQuery) : displayTitle}
          </h3>

          {!isFolderCard && snippet && !coverShowsSnippet && !artifactTemplate ? (
            <p className="dome-fs-card__snippet">
              {searchQuery ? highlightSnippet(snippet, searchQuery) : snippet}
            </p>
          ) : null}

          <div className="dome-fs-card__meta">
            <span className="dome-fs-card__type-badge" title={typeLabel}>{typeLabel}</span>
            <span className="dome-fs-card__modified">{timeAgo}</span>
          </div>
        </button>
      )}

      {/* Rendered via portal to `document.body`: the card is a containing block
          for fixed-position descendants (it has `container-type` + `overflow:
          hidden` + a hover `transform`), which would otherwise clip and
          mis-position this menu. */}
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
                options={{
                  isFolder: isFolderCard,
                  isNote: item.type === 'note',
                  canOpenInSplit: Boolean(onOpenInSplit),
                }}
                actions={{
                  onRename: startRenaming,
                  onOpenInSplit,
                  onOpenInWindow,
                  onChangeColor: isFolderCard && onChangeColor ? openColorPicker : undefined,
                  onMoveToFolder,
                  onMoveToProject,
                  onNewSubfolder: isFolderCard ? onNewSubfolder : undefined,
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
  prev.searchQuery === next.searchQuery
));

export default FolderCard;
