/** Shared cover previews for folder-tab cards and Quick Look-style thumbs. */

import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { FileEditIcon, Folder01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Spinner } from '@/components/ui/spinner';
import { formatRelativePair } from '@/lib/utils/formatting';
import type { Resource } from '@/lib/hooks/useResources';
import ResourceIcon from '@/components/shared/ResourceIcon';
import type { ResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';
import { ArtifactLiveThumb, NotePageThumb } from './FolderLivePreview';
import { getFolderColor, TYPE_COLORS } from './folderTabShared';
import { resourceTypeBadge, resourceTypeI18nKey } from '@/lib/workspace/explorerTypeLabels';
import { prepareNotePreviewMarkdown, NOTE_PREVIEW_MARKDOWN_MAX } from '@/lib/workspace/explorerPreviewMarkdown';

const SNIPPET_MAX = 280;
const SHEET_TYPES = new Set(['excel', 'csv', 'xlsx', 'xls']);

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

function PreviewFrame({
  variant,
  children,
}: {
  variant: 'media' | 'page' | 'note';
  children: ReactNode;
}) {
  return (
    <div className={`dome-fs-card__preview-frame dome-fs-card__preview-frame--${variant}`} aria-hidden>
      {children}
    </div>
  );
}

function TypeTileFallback({
  item,
  p,
  loading,
}: {
  item: Resource;
  p: CardPresentation;
  loading?: boolean;
}) {
  return (
    <div className="dome-fs-card__type-tile">
      {loading ? (
        <Spinner className="size-4 text-muted-foreground" />
      ) : (
        <>
          <TypeIconThumb item={item} accent={p.typeColor} />
          <span className="dome-fs-card__type-tile-label">{p.typeBadge}</span>
        </>
      )}
    </div>
  );
}

function FileCoverPreview({
  item,
  p,
  visual,
}: {
  item: Resource;
  p: CardPresentation;
  visual: ResourceVisualPreview;
}) {
  if (p.pdfDataUrl) {
    return (
      <PreviewFrame variant="page">
        <img src={p.pdfDataUrl} alt="" className="dome-fs-card__preview-img dome-fs-card__preview-img--page" draggable={false} />
      </PreviewFrame>
    );
  }
  if (p.coverImage) {
    return (
      <PreviewFrame variant="media">
        <img src={p.coverImage} alt="" className="dome-fs-card__preview-img" draggable={false} />
      </PreviewFrame>
    );
  }
  if (p.artifactTemplate) {
    return (
      <ArtifactLiveThumb
        bodyHtml={visual.artifact?.bodyHtml || p.artifactTemplate}
        artifactCss={visual.artifact?.artifactCss ?? ''}
        data={visual.artifact?.data ?? null}
      />
    );
  }
  if (p.isNoteCard && (p.noteMarkdown || p.snippet)) {
    return <NotePageThumb title={p.displayTitle} markdown={p.noteMarkdown || p.snippet} />;
  }
  const waiting = visual.loading && (
    p.isPdfCard || p.isMediaCard || p.isNoteCard || visual.kind === 'artifact'
  );
  return <TypeTileFallback item={item} p={p} loading={waiting} />;
}

/** Best-effort Markdown for the card: vault body, plain content, or Tiptap text. */
function pickMarkdown(item: Resource): string | null {
  const content = item.content;
  if (typeof content === 'string' && content.trim()) {
    const prepared = prepareNotePreviewMarkdown(content, NOTE_PREVIEW_MARKDOWN_MAX);
    if (prepared) return prepared;
    if (content.trim().startsWith('{')) {
      const text = plainTextFromContent(content);
      if (text) return prepareNotePreviewMarkdown(text) || null;
    }
  }
  if (typeof item.content_text === 'string' && item.content_text.trim()) {
    return prepareNotePreviewMarkdown(item.content_text) || null;
  }
  return null;
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
          <ResourceIcon type={item.type} name={item.title} size={28} strokeWidth={1.5} />
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
  return null;
}

export function highlightSnippet(text: string, query: string): ReactNode {
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

export type TranslateFn = TFunction;

export interface CardPresentation {
  folderColor: string | undefined;
  typeColor: string;
  typeLabel: string;
  typeBadge: string;
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
  childCount: number;
}

export function deriveCardPresentation(
  item: Resource,
  isFolder: boolean,
  visual: ResourceVisualPreview | null | undefined,
  searchQuery: string | undefined,
  t: TranslateFn,
  childCount = 0,
): CardPresentation {
  const folderColor = isFolder ? getFolderColor(item) : undefined;
  const hasCustomFolderColor = Boolean(folderColor && folderColor.startsWith('#'));
  const typeColor = isFolder
    ? (hasCustomFolderColor && folderColor ? folderColor : 'var(--foreground)')
    : (TYPE_COLORS[item.type] ?? 'var(--muted-foreground)');
  const typeLabel = t(resourceTypeI18nKey(item.type, isFolder));
  const typeBadge = isFolder ? typeLabel : resourceTypeBadge(item.type, item.title);
  const timePair = item.updated_at
    ? formatRelativePair(
      typeof item.updated_at === 'number'
        ? item.updated_at
        : new Date(item.updated_at).getTime(),
    )
    : { short: '—', full: '—' };

  const eagerThumbnail = isFolder ? null : pickThumbnail(item);
  const isPdfCard = !isFolder && (
    item.type === 'pdf' || visual?.kind === 'pdf' || /\.pdf$/i.test(item.title ?? '')
  );
  const pdfDataUrl = isPdfCard ? (visual?.pdfDataUrl ?? null) : null;
  const coverImage = eagerThumbnail || visual?.imageUrl || null;

  const artifactTemplate = !isFolder && visual?.kind === 'artifact' && !visual.failed
    ? (visual.artifact?.bodyHtml || visual.artifact?.template || null)
    : null;

  const eagerSnippet = isFolder ? '' : pickSnippet(item);
  const lazySnippet = isFolder
    ? ''
    : (visual?.snippet ?? (visual?.kind === 'artifact' ? visual.artifact?.snippet ?? '' : ''));
  const snippet = eagerSnippet || lazySnippet;

  const isSheetCard = !isFolder && (
    SHEET_TYPES.has(item.type)
    || /\.(xlsx?|csv)$/i.test(item.title ?? '')
    || /^\[Sheet:/i.test(snippet)
  );
  const isNoteCard = !isFolder && (item.type === 'note' || item.type === 'notebook');

  const rawNote = visual?.markdown?.trim() || pickMarkdown(item) || snippet;
  const noteMarkdown = isNoteCard && !searchQuery
    ? (rawNote ? prepareNotePreviewMarkdown(rawNote) || null : null)
    : isNoteCard && searchQuery && snippet
      ? snippet
      : null;

  return {
    folderColor,
    typeColor,
    typeLabel,
    typeBadge,
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
    hasCustomFolderColor,
    childCount,
  };
}

export function CoverPreviewContent({
  item,
  isFolderCard,
  p,
  visual,
}: {
  item: Resource;
  isFolderCard: boolean;
  p: CardPresentation;
  visual: ResourceVisualPreview;
}) {
  if (isFolderCard) {
    return (
      <div className="dome-fs-card__folder-preview">
        <HugeiconsIcon
          icon={Folder01Icon}
          className="dome-fs-card__cover-icon"
          style={{ color: p.typeColor }}
          strokeWidth={1.5}
        />
      </div>
    );
  }
  return <FileCoverPreview item={item} p={p} visual={visual} />;
}
