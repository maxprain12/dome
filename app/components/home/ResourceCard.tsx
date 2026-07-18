
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/types';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  File01Icon,
  Delete02Icon,
  FolderOpenIcon,
  Loading03Icon,
  AlertCircleIcon,
  PlayIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { formatDistanceToNow, formatShortDistance, formatFileSize, getResourceTypeLabel } from '@/lib/utils';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { useResourceVisualPreview } from '@/lib/hooks/useResourceVisualPreview';

interface ResourceCardProps {
  resource: Resource;
  onClick?: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  viewMode?: 'grid' | 'list';
  searchSnippet?: string;
  /** Shown when searching - e.g. folder path or deck name */
  searchOrigin?: string;
  /** Whether this card is selected (multi-select) */
  isSelected?: boolean;
  /** All selected resource IDs (for drag multiple) */
  selectedResourceIds?: Set<string>;
  /** Context menu callback (right-click) */
  onContextMenu?: (e: React.MouseEvent, resource: Resource) => void;
}

const listGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 100px 130px 90px 44px',
  gap: 12,
  alignItems: 'center',
} as const;

interface ArtifactMiniVisualProps {
  artifact: { artifactType: string; snippet: string; title: string | null } | null;
  fallbackColor: string;
}

function ArtifactMiniVisual({ artifact, fallbackColor }: ArtifactMiniVisualProps) {
  const snippet = artifact?.snippet?.trim() ?? '';
  const artifactType = artifact?.artifactType ?? 'custom';
  const miniLines = snippet
    ? snippet
        .split(/\n+|(?<=\.)\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return (
    <div
      className="absolute inset-0 p-3 flex flex-col gap-1.5 overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${fallbackColor}18, ${fallbackColor}06)`,
        color: 'var(--foreground)',
      }}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider opacity-70" style={{ color: fallbackColor }}>
        <HugeiconsIcon icon={File01Icon} size={11} strokeWidth={2} aria-hidden />
        <span>{artifactType}</span>
      </div>
      {miniLines.length > 0 ? (
        <div className="flex flex-col gap-1 min-h-0">
          {miniLines.map((line, idx) => (
            <div
              key={idx}
              className="h-1.5 rounded-sm opacity-70"
              style={{
                width: `${Math.min(100, 50 + ((line.length * 7) % 50))}%`,
                background: fallbackColor,
                opacity: 0.18 + (idx === 0 ? 0.22 : 0),
              }}
            />
          ))}
          <div className="mt-1 text-[11px] leading-snug line-clamp-2 opacity-90 text-foreground">
            {snippet.length > 90 ? `${snippet.slice(0, 87)}…` : snippet}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center opacity-30" style={{ color: fallbackColor }}>
          <HugeiconsIcon icon={File01Icon} size={48} strokeWidth={1} />
        </div>
      )}
    </div>
  );
}

function ProcessingStatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation();
  if (!status || status === 'completed') return null;

  const statusConfig = {
    pending: { icon: Loading03Icon, color: 'var(--warning)', label: t('home.status_pending'), spinning: false },
    processing: { icon: Loading03Icon, color: 'var(--primary)', label: t('home.status_processing'), spinning: true },
    failed: { icon: AlertCircleIcon, color: 'var(--destructive)', label: t('home.status_failed'), spinning: false },
  };

  const config = statusConfig[status as keyof typeof statusConfig];
  if (!config) return null;

  return (
    <span
      className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full bg-muted text-[10px] font-medium"
      style={{ color: config.color }}
    >
      <HugeiconsIcon
        icon={config.icon}
        size={10}
        className={config.spinning ? 'animate-spin' : ''}
        style={{ animation: config.spinning ? 'spin 1s linear infinite' : undefined }}
      />
      <span>{config.label}</span>
    </span>
  );
}

export default memo(function ResourceCard({
  resource,
  onClick,
  onDelete,
  viewMode = 'grid',
  searchSnippet,
  searchOrigin,
  isSelected = false,
  selectedResourceIds,
  onContextMenu,
}: ResourceCardProps) {
  const { t } = useTranslation();
  // Detect excel sub-type for type-specific icons and colors
  const getExcelSubType = (): 'xlsx' | 'csv' | 'generic' => {
    if (resource.type === 'excel') return 'xlsx';
    return 'generic';
  };

  const excelSubType = getExcelSubType();

  const getTypeColor = () => {
    if (resource.type === 'excel') {
      switch (excelSubType) {
        case 'xlsx': return 'var(--success)';
        default: return 'var(--muted-foreground)';
      }
    }
    switch (resource.type) {
      case 'note': return 'var(--primary)';
      case 'notebook': return 'var(--success)';
      case 'ppt': return 'var(--warning)';
      case 'image': return 'var(--primary)';
      case 'video': return 'var(--info)';
      case 'audio': return 'var(--warning)';
      case 'pdf': return 'var(--destructive)';
      case 'url': return 'var(--muted-foreground)';
      case 'folder': return 'var(--primary)';
      default: return 'var(--muted-foreground)';
    }
  };

  const getPreviewThumbnail = () => {
    // Has thumbnail data or specific preview image
    if (resource.thumbnail_data && resource.type !== 'pdf') {
      return `url(${resource.thumbnail_data})`;
    }
    if (resource.type === 'image' && (resource.metadata?.preview_image || resource.file_path)) {
      return `url(${resource.metadata?.preview_image || resource.file_path})`;
    }
    if (resource.type === 'url' && resource.metadata?.preview_image) {
      return `url(${resource.metadata.preview_image})`;
    }
    if (resource.type === 'video' && resource.metadata?.thumbnail) {
      return `url(${resource.metadata.thumbnail})`;
    }
    return null;
  };

  const thumbnail = getPreviewThumbnail();
  const hasThumbnail = !!thumbnail;
  const { preview: visualPreview, ref: previewRef } = useResourceVisualPreview(
    resource,
  );

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e as unknown as React.MouseEvent);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (resource.type === 'folder') return;
    const idsToDrag =
      selectedResourceIds?.has(resource.id) && selectedResourceIds.size > 1
        ? Array.from(selectedResourceIds)
        : [resource.id];
    e.dataTransfer.setData('application/x-dome-resource-id', idsToDrag[0] ?? resource.id);
    e.dataTransfer.setData('application/x-dome-resource-ids', JSON.stringify(idsToDrag));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      e.preventDefault();
      onContextMenu(e, resource);
    }
  };

  const isDraggable = resource.type !== 'folder';

  if (viewMode === 'list') {
    return (
      <div
        className={`group relative rounded-lg transition-colors border-b border-border last:border-b-0 hover:bg-card ${isSelected ? 'z-10 border-primary bg-brand-mint' : 'bg-card'
          } ${onClick ? 'cursor-pointer' : ''}`}
        style={{ ...listGridStyle, padding: '8px 16px', height: '48px' }}
        onContextMenu={handleContextMenu}
        aria-current={isSelected ? 'true' : undefined}
        draggable={isDraggable}
        onDragStart={handleDragStart}
      >
        {onClick ? (
          <button
            type="button"
            className="contents cursor-pointer text-left font-inherit rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            onClick={(e) => onClick(e)}
            onKeyDown={handleCardKeyDown}
            aria-label={resource.title || 'Abrir recurso'}
          >
            <span className="flex items-center gap-3 min-w-0">
              <span
                className="flex items-center justify-center size-8 rounded shrink-0"
                style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
              >
                <ResourceIcon type={resource.type} name={resource.title} size={20} className="size-5" strokeWidth={1.5} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate text-foreground">
                  {resource.title || 'Untitled'}
                </span>
                {searchSnippet && (
                  <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {searchSnippet}
                  </span>
                )}
              </span>
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {getResourceTypeLabel(resource.type)}
            </span>
            <span className="text-xs text-muted-foreground truncate tabular-nums">
              {resource.updated_at ? formatDistanceToNow(resource.updated_at) : '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate tabular-nums">
              {resource.file_size != null ? formatFileSize(resource.file_size) : '—'}
            </span>
          </button>
        ) : (
          <>
            <span className="flex items-center gap-3 min-w-0">
              <span
                className="flex items-center justify-center size-8 rounded shrink-0"
                style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
              >
                <ResourceIcon type={resource.type} name={resource.title} size={20} className="size-5" strokeWidth={1.5} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-sm font-medium truncate text-foreground">
                  {resource.title || 'Untitled'}
                </span>
                {searchSnippet && (
                  <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                    {searchSnippet}
                  </span>
                )}
              </span>
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {getResourceTypeLabel(resource.type)}
            </span>
            <span className="text-xs text-muted-foreground truncate tabular-nums">
              {resource.updated_at ? formatDistanceToNow(resource.updated_at) : '—'}
            </span>
            <span className="text-xs text-muted-foreground truncate tabular-nums">
              {resource.file_size != null ? formatFileSize(resource.file_size) : '—'}
            </span>
          </>
        )}
        <span className="flex justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onDelete ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-md hover:bg-[color-mix(in srgb, var(--destructive) 12%, transparent)] text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
              aria-label="Delete"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  // Grid view
  const previewBlock = (
    <div
      ref={previewRef as unknown as React.RefObject<HTMLDivElement>}
      className="relative flex-1 w-full bg-[var(--card)] overflow-hidden min-h-0"
    >
      {hasThumbnail ? (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-200 motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-[1.02]"
          style={{ backgroundImage: thumbnail! }}
        />
      ) : visualPreview.kind === 'pdf' && visualPreview.pdfDataUrl ? (
        <div
          className="absolute inset-0 bg-contain bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${visualPreview.pdfDataUrl})`,
            backgroundColor: 'var(--card)',
          }}
          aria-label={t('home.preview.pdf_thumb')}
        />
      ) : visualPreview.kind === 'artifact' && !visualPreview.failed ? (
        <ArtifactMiniVisual artifact={visualPreview.artifact} fallbackColor={getTypeColor()} />
      ) : visualPreview.loading ? (
        <div className="absolute inset-0 flex items-center justify-center opacity-60" style={{ color: getTypeColor() }}>
          <HugeiconsIcon icon={Loading03Icon} size={28} strokeWidth={1.5} className="animate-spin" />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:opacity-15 transition-opacity" style={{ color: getTypeColor() }}>
          {resource.type === 'folder'
            ? <HugeiconsIcon icon={FolderOpenIcon} size={64} strokeWidth={1} />
            : <HugeiconsIcon icon={File01Icon} size={48} strokeWidth={1} />
          }
        </div>
      )}

      {resource.type === 'video' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
          <div className="size-10 rounded-full bg-[color-mix(in_srgb,var(--card)_90%,transparent)] flex items-center justify-center shadow-lg">
            <HugeiconsIcon icon={PlayIcon} size={20} className="ml-0.5 text-black" fill="currentColor" />
          </div>
        </div>
      )}

      {!!resource.updated_at && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[color-mix(in_srgb,var(--card)_90%,transparent)] text-muted-foreground shadow-sm backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {formatShortDistance(resource.updated_at)}
        </div>
      )}
    </div>
  );

  const footerTextBlock = (
    <>
      <div
        className="flex items-center justify-center size-8 rounded shrink-0"
        style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
      >
        <ResourceIcon type={resource.type} name={resource.title} size={20} className="size-5" strokeWidth={1.5} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate" title={resource.title}>
          {resource.title || 'Untitled'}
        </div>
        {(searchSnippet || searchOrigin) ? (
          <div className="text-xs text-muted-foreground truncate">
            {searchSnippet || searchOrigin}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground truncate">
            {getResourceTypeLabel(resource.type)}
          </div>
        )}
      </div>
    </>
  );

  return (
    <section
      className={`group relative flex flex-col rounded-xl overflow-hidden transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-200 border ${isSelected
          ? 'ring-2 ring-primary border-transparent shadow-md'
          : 'border-border bg-card hover:border-[color-mix(in oklch, var(--primary) 85%, var(--background))] hover:shadow-md'
        } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ aspectRatio: 'var(--card-aspect-ratio, 4/3)' }}
      onContextMenu={handleContextMenu}
      aria-label={resource.title || 'Recurso'}
      aria-current={isSelected ? 'true' : undefined}
      draggable={isDraggable}
      onDragStart={handleDragStart}
    >
      {onClick ? (
        <button
          type="button"
          className="flex flex-col flex-1 min-h-0 w-full text-left p-0 m-0 border-0 bg-transparent rounded-none cursor-pointer font-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          onClick={(e) => onClick(e)}
          onKeyDown={handleCardKeyDown}
          aria-label={resource.title || 'Abrir recurso'}
        >
          {previewBlock}
          <div className="flex items-center gap-3 p-3 pr-11 border-t border-border bg-card shrink-0">
            {footerTextBlock}
          </div>
        </button>
      ) : (
        <>
          {previewBlock}
          <div className="flex items-center gap-3 p-3 border-t border-border bg-card shrink-0 relative">
            {footerTextBlock}
            <button
              type="button"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background text-muted-foreground transition-[color,background-color,border-color,box-shadow,opacity,transform] shrink-0 ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu?.(e, resource);
              }}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
            </button>
          </div>
        </>
      )}

      {onClick ? (
        <button
          type="button"
          className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-background text-muted-foreground transition-[color,background-color,border-color,box-shadow,opacity,transform] pointer-events-auto"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu?.(e, resource);
          }}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
        </button>
      ) : null}

      {resource.type === 'url' && resource.metadata && (
        <div className="absolute bottom-[52px] right-2">
          <ProcessingStatusBadge
            status={typeof resource.metadata === 'string'
              ? JSON.parse(resource.metadata).processing_status
              : resource.metadata.processing_status}
          />
        </div>
      )}
    </section>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.resource.id === nextProps.resource.id &&
    prevProps.resource.title === nextProps.resource.title &&
    prevProps.resource.updated_at === nextProps.resource.updated_at &&
    prevProps.resource.type === nextProps.resource.type &&
    prevProps.resource.content === nextProps.resource.content &&
    prevProps.resource.thumbnail_data === nextProps.resource.thumbnail_data &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.viewMode === nextProps.viewMode
  );
});
