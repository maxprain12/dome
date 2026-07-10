/** Grid card for a folder or resource inside FolderTabView. Shows thumbnail + content snippet. */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Check, FileText, Folder, MoreVertical, Play, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Resource } from '@/lib/hooks/useResources';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';
import { useResourceVisualPreview, type ResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from '@/lib/chat/artifactStorageShim';
import { useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
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
  // Served frame URL: srcdoc would inherit the strict renderer CSP and block
  // the preview's inline scripts in packaged builds (issue 465).
  const frameSource = useArtifactFrameSrc(srcDoc);
  return (
    <iframe
      title="artifact-preview"
      className="dome-fs-card__artifact-thumb"
      sandbox="allow-scripts"
      scrolling="no"
      {...(frameSource.src
        ? { src: frameSource.src }
        : { srcDoc: frameSource.fallbackSrcdoc ?? undefined })}
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

const MARKDOWN_PREVIEW_MAX = 1500;

/** Raw Markdown from the eager list payload (vault notes store Markdown in
 *  `content`); Tiptap JSON / HTML fall back to the plain-text snippet. */
function pickMarkdown(item: Resource): string | null {
  const content = item.content;
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('<')) return null;
  return trimmed.slice(0, MARKDOWN_PREVIEW_MAX);
}

/** Non-interactive rendered Markdown for the card cover (links/images inert). */
function NoteMarkdownThumb({ markdown }: { markdown: string }) {
  return (
    <div className="dome-fs-card__md-thumb" aria-hidden>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <span>{children}</span>,
          img: () => null,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
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
  onToggleSelect: (e: React.MouseEvent) => void;
  selected: boolean;
  showSelectionChrome: boolean;
  searchQuery?: string;
  searchFocused?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
}

type TranslateFn = ReturnType<typeof useTranslation>['t'];

/** All render-ready values derived from the resource + lazy visual preview. */
interface CardPresentation {
  folderColor: string | undefined;
  typeColor: string;
  typeLabel: string;
  timeAgo: string;
  coverImage: string | null;
  isPdfCover: boolean;
  artifactTemplate: string | null;
  snippet: string;
  coverShowsSnippet: boolean;
  noteMarkdown: string | null;
  displayTitle: string;
  isMediaCard: boolean;
  isDocCard: boolean;
  isVideoCard: boolean;
}

function deriveCardPresentation(
  item: Resource,
  isFolder: boolean,
  visual: ResourceVisualPreview,
  searchQuery: string | undefined,
  t: TranslateFn,
): CardPresentation {
  const folderColor = isFolder ? getFolderColor(item) : undefined;
  const typeColor = isFolder ? (folderColor ?? 'var(--dome-accent)') : 'var(--dome-text-muted)';
  const typeLabel = isFolder ? t('folder.typeFolder', 'Carpeta') : (TYPE_LABELS[item.type] ?? item.type);
  const timeAgo = item.updated_at
    ? formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })
    : '—';

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
  // Rendered-Markdown cover for notes (falls back to plain text while
  // searching so match highlighting keeps working).
  const noteMarkdown = coverShowsSnippet && !searchQuery
    ? (pickMarkdown(item) ?? visual.markdown)
    : null;

  const displayTitle = item.title || t('folder.untitled');

  // Format-aware card shape: media keeps the asset's own aspect ratio,
  // documents render as a portrait "page", folders are compact tiles.
  const isMediaCard = !isFolder && (item.type === 'image' || item.type === 'video');
  const isDocCard = !isFolder && !isMediaCard && (item.type === 'pdf' || coverShowsSnippet);
  const isVideoCard = !isFolder && item.type === 'video';

  return {
    folderColor,
    typeColor,
    typeLabel,
    timeAgo,
    coverImage,
    isPdfCover,
    artifactTemplate,
    snippet,
    coverShowsSnippet,
    noteMarkdown,
    displayTitle,
    isMediaCard,
    isDocCard,
    isVideoCard,
  };
}

function buildCardClass(
  p: CardPresentation,
  flags: { isFolderCard: boolean; searchFocused?: boolean; selected: boolean; menuOpen: boolean; isLast: boolean },
): string {
  return [
    'dome-fs-card',
    flags.isFolderCard ? 'dome-fs-card--folder' : '',
    p.isMediaCard ? 'dome-fs-card--media' : '',
    p.isDocCard ? 'dome-fs-card--doc' : '',
    p.artifactTemplate ? 'dome-fs-card--artifact-card' : '',
    flags.searchFocused ? 'dome-fs-card--focused' : '',
    flags.selected ? 'dome-fs-card--selected' : '',
    flags.menuOpen ? 'dome-fs-card--menu-open' : '',
    flags.isLast ? 'dome-fs-card--last' : '',
  ].filter(Boolean).join(' ');
}

/** Cover preview by priority: folder icon → artifact → image → Markdown → snippet → fallback icon. */
function CoverPreviewContent({
  item,
  isFolderCard,
  p,
  visual,
  searchQuery,
}: {
  item: Resource;
  isFolderCard: boolean;
  p: CardPresentation;
  visual: ResourceVisualPreview;
  searchQuery?: string;
}) {
  if (isFolderCard) {
    return (
      <Folder
        className="dome-fs-card__cover-icon"
        style={{ color: p.typeColor }}
        strokeWidth={1.25}
      />
    );
  }
  if (p.artifactTemplate) {
    return <ArtifactThumb template={p.artifactTemplate} data={visual.artifact?.data ?? null} />;
  }
  if (p.coverImage) {
    // Real <img> so the asset's intrinsic aspect ratio drives the card
    // height (masonry layout); PDF pages pin to the top like a document.
    return (
      <img
        src={p.coverImage}
        alt=""
        className={`dome-fs-card__cover-img${p.isPdfCover ? ' dome-fs-card__cover-img--page' : ''}`}
        draggable={false}
        loading="lazy"
      />
    );
  }
  if (p.noteMarkdown) {
    return <NoteMarkdownThumb markdown={p.noteMarkdown} />;
  }
  if (p.coverShowsSnippet) {
    return (
      <p className="dome-fs-card__cover-snippet">
        {searchQuery ? highlightSnippet(p.snippet, searchQuery) : p.snippet}
      </p>
    );
  }
  if (visual.loading) {
    return (
      <div className="dome-fs-card__cover-fallback" style={{ color: p.typeColor }} aria-hidden>
        <DomeResourceIcon type={item.type} name={item.title} size={28} strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <div className="dome-fs-card__cover-fallback" style={{ color: p.typeColor }}>
      {item.type === 'note' || item.type === 'notebook' ? (
        <FileText className="size-7" strokeWidth={1.25} />
      ) : (
        <DomeResourceIcon type={item.type} name={item.title} size={28} strokeWidth={1.25} />
      )}
    </div>
  );
}

function CardCover({
  item,
  isFolderCard,
  p,
  visual,
  searchQuery,
  showSelectionChrome,
  selected,
  renaming,
  hovered,
  menuOpen,
  previewRef,
  menuBtnRef,
  onActivate,
  onToggleSelect,
  onShowMenu,
  onToggleMenu,
  t,
}: {
  item: Resource;
  isFolderCard: boolean;
  p: CardPresentation;
  visual: ResourceVisualPreview;
  searchQuery?: string;
  showSelectionChrome: boolean;
  selected: boolean;
  renaming: boolean;
  hovered: boolean;
  menuOpen: boolean;
  previewRef: (node: Element | null) => void;
  menuBtnRef: React.RefObject<HTMLButtonElement>;
  onActivate: (e: React.MouseEvent) => void;
  onToggleSelect: (e: React.MouseEvent) => void;
  onShowMenu: (pos: { top: number; right: number }) => void;
  onToggleMenu: () => void;
  t: TranslateFn;
}) {
  return (
    // Cover is a mouse-only convenience target; the body below is the
    // keyboard-accessible button (role=button + tabIndex + onKeyDown).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      ref={previewRef as unknown as React.Ref<HTMLDivElement>}
      className={`dome-fs-card__cover cursor-pointer${p.artifactTemplate ? ' dome-fs-card__cover--artifact' : ''}`}
      onClick={onActivate}
      style={isFolderCard
        ? { background: `color-mix(in srgb, ${p.typeColor} 12%, var(--dome-surface))` }
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

      <CoverPreviewContent
        item={item}
        isFolderCard={isFolderCard}
        p={p}
        visual={visual}
        searchQuery={searchQuery}
      />

      {p.isVideoCard ? (
        <span className="dome-fs-card__play-badge" aria-hidden>
          <Play className="size-4" fill="currentColor" strokeWidth={0} />
        </span>
      ) : null}

      {(hovered || menuOpen) && !renaming ? (
        <button
          ref={menuBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!menuOpen && menuBtnRef.current) {
              const rect = menuBtnRef.current.getBoundingClientRect();
              onShowMenu({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            }
            onToggleMenu();
          }}
          className="dome-fs-card__menu-btn"
          aria-label={t('folder.rowActions', 'Acciones')}
          title={t('folder.rowActions', 'Acciones')}
        >
          <MoreVertical className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function CardBody({
  renaming,
  renameRef,
  renameValue,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onActivate,
  isFolderCard,
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
  isFolderCard: boolean;
  p: CardPresentation;
  searchQuery?: string;
  t: TranslateFn;
}) {
  if (renaming) {
    return (
      <div className="dome-fs-card__body">
        <div className="dome-fs-card__rename">
          <input
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
            className="dome-fs-tree-row__rename-input"
          />
          <button type="button" onClick={(e) => { e.stopPropagation(); onCommitRename(); }} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--confirm">
            <Check className="size-3.5" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onCancelRename(); }} className="dome-fs-tree-row__rename-btn dome-fs-tree-row__rename-btn--cancel">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="dome-fs-card__body"
      onClick={onActivate}
      aria-label={p.displayTitle}
    >
      <h3 className="dome-fs-card__title" title={p.displayTitle}>
        {searchQuery ? highlightSnippet(p.displayTitle, searchQuery) : p.displayTitle}
      </h3>

      {!isFolderCard && p.snippet && !p.coverShowsSnippet && !p.artifactTemplate ? (
        <p className="dome-fs-card__snippet">
          {searchQuery ? highlightSnippet(p.snippet, searchQuery) : p.snippet}
        </p>
      ) : null}

      <div className="dome-fs-card__meta">
        <span className="dome-fs-card__type-badge" title={p.typeLabel}>{p.typeLabel}</span>
        <span className="dome-fs-card__modified">{p.timeAgo}</span>
      </div>
    </button>
  );
}

function CardMenuLayers({
  item,
  isFolderCard,
  folderColor,
  menuOpen,
  menuPos,
  onDismissMenu,
  startRenaming,
  openColorPicker,
  colorPickerPos,
  onCloseColorPicker,
  actions,
}: {
  item: Resource;
  isFolderCard: boolean;
  folderColor: string | undefined;
  menuOpen: boolean;
  menuPos: { top: number; right: number } | null;
  onDismissMenu: () => void;
  startRenaming: () => void;
  openColorPicker: () => void;
  colorPickerPos: { top: number; left: number } | null;
  onCloseColorPicker: () => void;
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
    <>
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
                resource={item}
                options={{
                  isFolder: isFolderCard,
                  isNote: item.type === 'note',
                  canOpenInSplit: Boolean(actions.onOpenInSplit),
                }}
                actions={{
                  onRename: startRenaming,
                  onOpenInSplit: actions.onOpenInSplit,
                  onOpenInWindow: actions.onOpenInWindow,
                  onChangeColor: isFolderCard && actions.onChangeColor ? openColorPicker : undefined,
                  onMoveToFolder: actions.onMoveToFolder,
                  onMoveToProject: actions.onMoveToProject,
                  onNewSubfolder: isFolderCard ? actions.onNewSubfolder : undefined,
                  onDelete: actions.onDelete,
                }}
                onDismiss={onDismissMenu}
              />
            </div>,
            document.body,
          )
        : null}

      {colorPickerPos && actions.onChangeColor ? (
        <ColorPickerPopover
          pos={colorPickerPos}
          currentColor={folderColor?.startsWith('#') ? folderColor : FOLDER_COLOR_DEFAULT}
          onSave={actions.onChangeColor}
          onClose={onCloseColorPicker}
        />
      ) : null}
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
  onToggleSelect,
  selected,
  showSelectionChrome,
  searchQuery,
  searchFocused,
  cardRef,
}: FolderCardProps) {
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

  // Lazy content preview (PDF first page, artifact mini-visual, image thumbnail
  // or text snippet) — the lightweight list payload omits content/thumbnails,
  // so they are fetched per-card on demand via this hook.
  const { preview: visual, ref: previewRef } = useResourceVisualPreview(isFolder ? null : item);

  const isFolderCard = isFolder;
  const p = deriveCardPresentation(item, isFolder, visual, searchQuery, t);

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

  const cardClass = buildCardClass(p, { isFolderCard, searchFocused, selected, menuOpen, isLast });

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
      <CardCover
        item={item}
        isFolderCard={isFolderCard}
        p={p}
        visual={visual}
        searchQuery={searchQuery}
        showSelectionChrome={showSelectionChrome}
        selected={selected}
        renaming={renaming}
        hovered={hovered}
        menuOpen={menuOpen}
        previewRef={previewRef}
        menuBtnRef={menuBtnRef}
        onActivate={handleCardActivate}
        onToggleSelect={onToggleSelect}
        onShowMenu={setMenuPos}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        t={t}
      />

      <CardBody
        renaming={renaming}
        renameRef={renameRef}
        renameValue={renameValue}
        onRenameValueChange={setRenameValue}
        onCommitRename={commitRename}
        onCancelRename={() => setRenaming(false)}
        onActivate={handleCardActivate}
        isFolderCard={isFolderCard}
        p={p}
        searchQuery={searchQuery}
        t={t}
      />

      <CardMenuLayers
        item={item}
        isFolderCard={isFolderCard}
        folderColor={p.folderColor}
        menuOpen={menuOpen}
        menuPos={menuPos}
        onDismissMenu={() => setMenuOpen(false)}
        startRenaming={startRenaming}
        openColorPicker={openColorPicker}
        colorPickerPos={colorPickerPos}
        onCloseColorPicker={() => setColorPickerPos(null)}
        actions={{
          onDelete,
          onChangeColor,
          onMoveToProject,
          onMoveToFolder,
          onOpenInSplit,
          onOpenInWindow,
          onNewSubfolder,
        }}
      />
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
