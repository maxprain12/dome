/** Grid card for a folder or resource inside FolderTabView. */

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  CheckIcon,
  FileEditIcon,
  Folder01Icon,
  MoreVerticalIcon,
  PlayIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { MetaLine, SafeText } from '@/components/shared/SafeText';
import { typesetDocsClass } from '@/lib/typeset';
import { cn } from '@/lib/utils';
import { formatRelativePair } from '@/lib/utils/formatting';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Resource } from '@/lib/hooks/useResources';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { useResourceVisualPreview, type ResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';
import { DOME_IFRAME_STORAGE_SHIM_SCRIPT } from '@/lib/chat/artifactStorageShim';
import { useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
import { getFolderColor, TYPE_LABELS, FOLDER_COLOR_DEFAULT } from './folderTabShared';
import ColorPickerPopover from './ColorPickerPopover';
import ResourceContextMenuItems from './ResourceContextMenuItems';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const SNIPPET_MAX = 280;
const MARKDOWN_PREVIEW_MAX = 1500;
const SHEET_TYPES = new Set(['excel', 'csv', 'xlsx', 'xls']);

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

function ArtifactThumb({ template, data }: { template: string; data: Record<string, unknown> | null }) {
  const srcDoc = useMemo(() => buildArtifactThumbSrcDoc(template, data), [template, data]);
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
      /* fall through */
    }
  }
  return stripHtml(content);
}

function pickSnippet(item: Resource): string {
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  for (const key of ['snippet', 'summary', 'description', 'excerpt', 'preview_text'] as const) {
    const c = meta[key];
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  if (typeof item.content_text === 'string' && item.content_text.trim()) {
    return item.content_text.trim().slice(0, SNIPPET_MAX);
  }
  if (typeof item.content === 'string' && item.content.trim()) {
    const text = plainTextFromContent(item.content);
    if (text) return text.slice(0, SNIPPET_MAX);
  }
  return '';
}

/** Best-effort Markdown for the card: vault body, plain content, or Tiptap text. */
function pickMarkdown(item: Resource): string | null {
  const content = item.content;
  if (typeof content === 'string' && content.trim()) {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('<')) {
      return trimmed.slice(0, MARKDOWN_PREVIEW_MAX);
    }
    if (trimmed.startsWith('{')) {
      const text = plainTextFromContent(trimmed);
      if (text) return text.slice(0, MARKDOWN_PREVIEW_MAX);
    }
  }
  if (typeof item.content_text === 'string' && item.content_text.trim()) {
    return item.content_text.trim().slice(0, MARKDOWN_PREVIEW_MAX);
  }
  return null;
}

function normalizeCardTitle(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[.…]+$/u, '')
    .trim()
    .toLowerCase();
}

/**
 * Drop a leading heading/line that repeats the card title so the preview
 * doesn't paint the same long name twice (footer + body).
 */
function stripLeadingTitleFromMarkdown(markdown: string, title: string): string {
  const normalizedTitle = normalizeCardTitle(title);
  if (!normalizedTitle || !markdown.trim()) return markdown;

  const headingMatch = markdown.match(/^\s{0,3}#{1,6}\s+(.+?)(?:\n+|$)/u);
  if (headingMatch) {
    const heading = normalizeCardTitle(headingMatch[1] ?? '');
    if (heading && (heading === normalizedTitle || heading.startsWith(`${normalizedTitle} `))) {
      return markdown.slice(headingMatch[0].length).trimStart();
    }
  }

  const lineMatch = markdown.match(/^\s*(.+?)(?:\n+|$)/u);
  if (lineMatch) {
    const line = normalizeCardTitle(lineMatch[1] ?? '');
    if (line && line === normalizedTitle) {
      return markdown.slice(lineMatch[0].length).trimStart();
    }
  }

  return markdown;
}

function NoteMarkdownThumb({ markdown, title }: { markdown: string; title: string }) {
  const body = useMemo(
    () => stripLeadingTitleFromMarkdown(markdown, title),
    [markdown, title],
  );
  if (!body) {
    return (
      <div className="dome-fs-card__note-thumb dome-fs-card__note-thumb--empty" aria-hidden>
        <HugeiconsIcon icon={FileEditIcon} strokeWidth={1.25} />
      </div>
    );
  }
  return (
    <div className={typesetDocsClass('dome-fs-card__md-thumb')} aria-hidden>
      <div className="dome-fs-card__md-thumb-inner">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children }) => <span className="dome-fs-card__md-link">{children}</span>,
            img: () => null,
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function PdfPageThumb({ dataUrl }: { dataUrl: string }) {
  return (
    <div className="dome-fs-card__pdf-thumb" aria-hidden>
      <img
        src={dataUrl}
        alt=""
        className="dome-fs-card__pdf-thumb-img"
        draggable={false}
        loading="lazy"
      />
    </div>
  );
}

function PreviewLoading() {
  return (
    <div className="dome-fs-card__cover-loading" aria-hidden>
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  );
}

type SheetPreview = {
  sheet: string | null;
  headers: string[];
  rows: string[][];
};

/** Turn a spreadsheet text dump into a small table preview. */
function parseSpreadsheetSnippet(snippet: string): SheetPreview | null {
  const trimmed = snippet.trim();
  if (!trimmed) return null;

  const sheetMatch = trimmed.match(/^\[Sheet:\s*([^\]]+)\]\s*/i);
  const body = (sheetMatch ? trimmed.slice(sheetMatch[0].length) : trimmed).trim();
  if (!body) return null;

  let lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    // Flattened dumps: "headers 1,row… 2,row…"
    lines = body.split(/\s+(?=\d+,)/).map((l) => l.trim()).filter(Boolean);
  }
  if (lines.length === 0) return null;

  const splitCells = (line: string) =>
    line.split(',').map((c) => c.trim()).slice(0, 4);

  const headers = splitCells(lines[0]).slice(0, 3);
  if (headers.length === 0) return null;

  const rows = lines.slice(1, 4).map((line) => {
    const cells = splitCells(line);
    // Drop leading numeric index column when headers don't look like an ID list
    if (cells.length > headers.length && /^\d+$/.test(cells[0] ?? '')) {
      return cells.slice(1, headers.length + 1);
    }
    return cells.slice(0, headers.length);
  }).filter((r) => r.some(Boolean));

  return {
    sheet: sheetMatch?.[1]?.trim() ?? null,
    headers,
    rows,
  };
}

function SpreadsheetThumb({ snippet }: { snippet: string }) {
  const parsed = useMemo(() => parseSpreadsheetSnippet(snippet), [snippet]);
  if (!parsed) {
    return (
      <div className="dome-fs-card__sheet dome-fs-card__sheet--empty" aria-hidden>
        <span className="dome-fs-card__sheet-label">Excel</span>
      </div>
    );
  }
  return (
    <div className="dome-fs-card__sheet" aria-hidden>
      {parsed.sheet ? (
        <div className="dome-fs-card__sheet-tab">{parsed.sheet}</div>
      ) : null}
      <table className="dome-fs-card__sheet-table">
        <thead>
          <tr>
            {parsed.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, i) => (
            <tr key={i}>
              {parsed.headers.map((_, j) => (
                <td key={j}>{row[j] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteTextThumb({ text, searchQuery }: { text: string; searchQuery?: string }) {
  return (
    <p className="dome-fs-card__note-thumb" aria-hidden>
      {searchQuery ? highlightSnippet(text, searchQuery) : text}
    </p>
  );
}

function TypeIconThumb({
  item,
  accent,
}: {
  item: Resource;
  accent?: string;
}) {
  return (
    <div
      className="dome-fs-card__type-thumb"
      style={accent ? { color: accent } : undefined}
      aria-hidden
    >
      <div className="dome-fs-card__type-thumb-glyph">
        {item.type === 'note' || item.type === 'notebook' ? (
          <HugeiconsIcon icon={FileEditIcon} strokeWidth={1.25} />
        ) : (
          <ResourceIcon type={item.type} name={item.title} size={32} strokeWidth={1.25} />
        )}
      </div>
    </div>
  );
}

function pickThumbnail(item: Resource): string | null {
  if (item.thumbnail_data) return item.thumbnail_data;
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  for (const key of ['preview_image', 'thumbnail', 'og_image', 'cover'] as const) {
    const c = meta[key];
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

interface CardPresentation {
  folderColor: string | undefined;
  typeColor: string;
  typeLabel: string;
  timeAgoShort: string;
  timeAgoFull: string;
  coverImage: string | null;
  isPdfCover: boolean;
  pdfDataUrl: string | null;
  artifactTemplate: string | null;
  snippet: string;
  noteMarkdown: string | null;
  displayTitle: string;
  isMediaCard: boolean;
  isVideoCard: boolean;
  isSheetCard: boolean;
  isNoteCard: boolean;
  isPdfCard: boolean;
  hasCustomFolderColor: boolean;
}

function deriveCardPresentation(
  item: Resource,
  isFolder: boolean,
  visual: ResourceVisualPreview,
  searchQuery: string | undefined,
  t: TranslateFn,
): CardPresentation {
  const folderColor = isFolder ? getFolderColor(item) : undefined;
  const typeColor = isFolder ? (folderColor ?? 'var(--muted-foreground)') : 'var(--muted-foreground)';
  const typeLabel = isFolder
    ? t('folder.typeFolder', 'Carpeta')
    : (TYPE_LABELS[item.type] ?? item.type);
  const timePair = item.updated_at
    ? formatRelativePair(
      typeof item.updated_at === 'number'
        ? item.updated_at
        : new Date(item.updated_at).getTime(),
    )
    : { short: '—', full: '—' };

  const eagerThumbnail = isFolder ? null : pickThumbnail(item);
  const isPdfCard = !isFolder && (
    item.type === 'pdf' || visual.kind === 'pdf' || /\.pdf$/i.test(item.title ?? '')
  );
  const pdfDataUrl = isPdfCard ? visual.pdfDataUrl : null;
  const coverImage = eagerThumbnail || visual.imageUrl || null;

  const artifactTemplate = !isFolder && visual.kind === 'artifact' && !visual.failed
    ? (visual.artifact?.template ?? null)
    : null;

  const eagerSnippet = isFolder ? '' : pickSnippet(item);
  const lazySnippet = isFolder
    ? ''
    : (visual.snippet ?? (visual.kind === 'artifact' ? visual.artifact?.snippet ?? '' : ''));
  const snippet = eagerSnippet || lazySnippet;

  const isSheetCard = !isFolder && (
    SHEET_TYPES.has(item.type)
    || /\.(xlsx?|csv)$/i.test(item.title ?? '')
    || /^\[Sheet:/i.test(snippet)
  );
  const isNoteCard = !isFolder && (item.type === 'note' || item.type === 'notebook');

  // Prefer lazy vault markdown, then eager content / content_text, then snippet.
  const noteMarkdown = isNoteCard && !searchQuery
    ? (visual.markdown?.trim() || pickMarkdown(item) || (snippet ? snippet.slice(0, MARKDOWN_PREVIEW_MAX) : null))
    : isNoteCard && searchQuery && snippet
      ? snippet
      : null;

  return {
    folderColor,
    typeColor,
    typeLabel,
    timeAgoShort: timePair.short,
    timeAgoFull: timePair.full,
    coverImage,
    isPdfCover: Boolean(pdfDataUrl),
    pdfDataUrl,
    artifactTemplate,
    snippet,
    noteMarkdown,
    displayTitle: item.title || t('folder.untitled'),
    isMediaCard: !isFolder && (item.type === 'image' || item.type === 'video'),
    isVideoCard: !isFolder && item.type === 'video',
    isSheetCard,
    isNoteCard,
    isPdfCard,
    hasCustomFolderColor: Boolean(folderColor && folderColor.startsWith('#')),
  };
}

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
      <HugeiconsIcon
        icon={Folder01Icon}
        className="dome-fs-card__cover-icon"
        style={{ color: p.typeColor }}
        strokeWidth={1.25}
      />
    );
  }
  if (p.artifactTemplate) {
    return <ArtifactThumb template={p.artifactTemplate} data={visual.artifact?.data ?? null} />;
  }
  // PDF first-page render (lazy IPC) — prefer over generic icon.
  if (p.pdfDataUrl) {
    return <PdfPageThumb dataUrl={p.pdfDataUrl} />;
  }
  if (p.isPdfCard && visual.loading) {
    return <PreviewLoading />;
  }
  if (p.coverImage) {
    return (
      <img
        src={p.coverImage}
        alt=""
        className="dome-fs-card__cover-img"
        draggable={false}
        loading="lazy"
      />
    );
  }
  if (p.isSheetCard && p.snippet) {
    return <SpreadsheetThumb snippet={p.snippet} />;
  }
  if (p.isNoteCard) {
    if (p.noteMarkdown) {
      return searchQuery
        ? <NoteTextThumb text={p.noteMarkdown} searchQuery={searchQuery} />
        : <NoteMarkdownThumb markdown={p.noteMarkdown} title={p.displayTitle} />;
    }
    if (visual.loading) return <PreviewLoading />;
  }
  if (p.snippet && !p.isSheetCard) {
    return <NoteTextThumb text={p.snippet} searchQuery={searchQuery} />;
  }
  if (visual.loading) {
    return <PreviewLoading />;
  }
  return <TypeIconThumb item={item} accent={p.typeColor} />;
}

function ResourceCaption({
  p,
  searchQuery,
}: {
  p: CardPresentation;
  searchQuery?: string;
}) {
  return (
    <div className="dome-fs-card__caption">
      {/* Single line in overlay captions — long names get ellipsis + title tooltip. */}
      <SafeText as="h3" lines={1} className="dome-fs-card__title" title={p.displayTitle}>
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
    </div>
  );
}

function CardChrome({
  showSelectionChrome,
  selected,
  renaming,
  hovered,
  menuOpen,
  menuBtnRef,
  onToggleSelect,
  onShowMenu,
  onToggleMenu,
  t,
}: {
  showSelectionChrome: boolean;
  selected: boolean;
  renaming: boolean;
  hovered: boolean;
  menuOpen: boolean;
  menuBtnRef: React.RefObject<HTMLButtonElement>;
  onToggleSelect: (e: React.MouseEvent) => void;
  onShowMenu: (pos: { top: number; right: number }) => void;
  onToggleMenu: () => void;
  t: TranslateFn;
}) {
  return (
    <>
      {showSelectionChrome ? (
        <span className="dome-fs-card__select">
          <Input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={(e) => { e.stopPropagation(); onToggleSelect(e); }}
            className="dome-fs-tree-row__checkbox rounded border"
            aria-label={t('selection.deselect')}
          />
        </span>
      ) : null}

      {(hovered || menuOpen) && !renaming ? (
        <Button
          ref={menuBtnRef}
          type="button"
          variant="secondary"
          size="icon-xs"
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
          <HugeiconsIcon icon={MoreVerticalIcon} />
        </Button>
      ) : null}
    </>
  );
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
      className="dome-fs-card__footer h-auto"
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
      {menuOpen && menuPos
        ? createPortal(
            <DropdownMenu open onOpenChange={(open) => { if (!open) onDismissMenu(); }}>
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
              </DropdownMenuContent>
            </DropdownMenu>,
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

  const { preview: visual, ref: previewRef } = useResourceVisualPreview(isFolder ? null : item);
  const isFolderCard = isFolder;
  const p = deriveCardPresentation(item, isFolder, visual, searchQuery, t);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== item.title) onRename(trimmed);
    setRenaming(false);
  };

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

  const chrome = (
    <CardChrome
      showSelectionChrome={showSelectionChrome}
      selected={selected}
      renaming={renaming}
      hovered={hovered}
      menuOpen={menuOpen}
      menuBtnRef={menuBtnRef}
      onToggleSelect={onToggleSelect}
      onShowMenu={setMenuPos}
      onToggleMenu={() => setMenuOpen((v) => !v)}
      t={t}
    />
  );

  // Notes / artifacts: preview + footer (titles can be long — never overlay).
  // Media / PDF / sheets keep the compact overlay caption.
  const useStackedMeta = isFolderCard || p.isNoteCard || Boolean(p.artifactTemplate);

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
    <div
      ref={cardRef}
      className={cn(
        'dome-fs-card',
        isFolderCard ? 'dome-fs-card--folder' : 'dome-fs-card--resource',
        useStackedMeta && !isFolderCard && 'dome-fs-card--stacked',
        p.isMediaCard && 'dome-fs-card--media',
        p.isSheetCard && 'dome-fs-card--sheet',
        p.isNoteCard && 'dome-fs-card--note',
        p.isPdfCard && 'dome-fs-card--pdf',
        p.artifactTemplate && 'dome-fs-card--artifact-card',
        searchFocused && 'dome-fs-card--focused',
        selected && 'dome-fs-card--selected',
        menuOpen && 'dome-fs-card--menu-open',
        isLast && 'dome-fs-card--last',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        if (renaming) return;
        e.preventDefault();
        setMenuPos({ top: e.clientY, right: window.innerWidth - e.clientX });
        setMenuOpen(true);
      }}
    >
      {isFolderCard ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div
            className="dome-fs-card__cover dome-fs-card__cover--folder cursor-pointer"
            onClick={handleCardActivate}
            style={p.hasCustomFolderColor
              ? { background: `color-mix(in srgb, ${p.typeColor} 14%, var(--card))` }
              : undefined}
          >
            {chrome}
            <CoverPreviewContent
              item={item}
              isFolderCard
              p={p}
              visual={visual}
              searchQuery={searchQuery}
            />
          </div>
          {stackedFooter}
        </>
      ) : renaming ? (
        stackedFooter
      ) : useStackedMeta ? (
        <>
          <div
            ref={previewRef as unknown as React.Ref<HTMLDivElement>}
            className="dome-fs-card__surface"
          >
            <Button
              type="button"
              variant="ghost"
              className={cn(
                'dome-fs-card__cover dome-fs-card__cover--resource dome-fs-card__cover--stacked h-auto',
                p.artifactTemplate && 'dome-fs-card__cover--artifact',
              )}
              onClick={handleCardActivate}
              aria-label={p.displayTitle}
            >
              {chrome}
              <CoverPreviewContent
                item={item}
                isFolderCard={false}
                p={p}
                visual={visual}
                searchQuery={searchQuery}
              />
            </Button>
          </div>
          {stackedFooter}
        </>
      ) : (
        <div
          ref={previewRef as unknown as React.Ref<HTMLDivElement>}
          className="dome-fs-card__surface"
        >
          <Button
            type="button"
            variant="ghost"
            className={cn(
              'dome-fs-card__cover dome-fs-card__cover--resource h-auto',
              p.artifactTemplate && 'dome-fs-card__cover--artifact',
            )}
            onClick={handleCardActivate}
            aria-label={p.displayTitle}
          >
            {chrome}
            <CoverPreviewContent
              item={item}
              isFolderCard={false}
              p={p}
              visual={visual}
              searchQuery={searchQuery}
            />
            {p.isVideoCard ? (
              <span className="dome-fs-card__play-badge" aria-hidden>
                <HugeiconsIcon icon={PlayIcon} fill="currentColor" strokeWidth={0} />
              </span>
            ) : null}
            <div className="dome-fs-card__scrim" aria-hidden />
            <ResourceCaption p={p} searchQuery={searchQuery} />
          </Button>
        </div>
      )}

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
