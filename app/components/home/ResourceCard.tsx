
import { memo } from 'react';
import type { Resource } from '@/types';
import { FileText, File, FileSpreadsheet, FileType, Table2, Video, Music, Image as ImageIcon, Link2, Trash2, FolderOpen, Loader2, CheckCircle2, AlertCircle, Notebook, Play, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow, formatShortDistance, formatFileSize, extractPlainTextFromTiptap } from '@/lib/utils';

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

function ProcessingStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'completed') return null;

  const statusConfig = {
    pending: { icon: Loader2, color: 'var(--warning)', label: 'Pending', spinning: false },
    processing: { icon: Loader2, color: 'var(--accent)', label: 'Processing', spinning: true },
    failed: { icon: AlertCircle, color: 'var(--error)', label: 'Failed', spinning: false },
  };

  const config = statusConfig[status as keyof typeof statusConfig];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <span
      className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[10px] font-medium"
      style={{ color: config.color }}
    >
      <Icon
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
  // Detect document sub-type for type-specific icons and colors
  const getDocumentSubType = (): 'docx' | 'xlsx' | 'csv' | 'txt' | 'generic' => {
    if (resource.type !== 'document') return 'generic';
    const filename = (resource.original_filename || resource.title || '').toLowerCase();
    const mime = resource.file_mime_type || '';
    if (filename.endsWith('.docx') || filename.endsWith('.doc') || mime.includes('wordprocessingml') || mime.includes('msword')) return 'docx';
    if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'xlsx';
    if (filename.endsWith('.csv') || mime === 'text/csv') return 'csv';
    if (filename.endsWith('.txt') || filename.endsWith('.md') || mime.startsWith('text/')) return 'txt';
    return 'generic';
  };

  const docSubType = getDocumentSubType();

  const getIcon = () => {
    // Document sub-type specific icons
    if (resource.type === 'document') {
      switch (docSubType) {
        case 'docx': return <FileText className="w-5 h-5" strokeWidth={1.5} />;
        case 'xlsx': return <FileSpreadsheet className="w-5 h-5" strokeWidth={1.5} />;
        case 'csv': return <Table2 className="w-5 h-5" strokeWidth={1.5} />;
        case 'txt': return <FileType className="w-5 h-5" strokeWidth={1.5} />;
        default: return <File className="w-5 h-5" strokeWidth={1.5} />;
      }
    }

    switch (resource.type) {
      case 'note': return <FileText className="w-5 h-5" strokeWidth={1.5} />;
      case 'notebook': return <Notebook className="w-5 h-5" strokeWidth={1.5} />;
      case 'pdf': return <File className="w-5 h-5" strokeWidth={1.5} />;
      case 'video': return <Video className="w-5 h-5" strokeWidth={1.5} />;
      case 'audio': return <Music className="w-5 h-5" strokeWidth={1.5} />;
      case 'image': return <ImageIcon className="w-5 h-5" strokeWidth={1.5} />;
      case 'url': return <Link2 className="w-5 h-5" strokeWidth={1.5} />;
      case 'folder': return <FolderOpen className="w-5 h-5" strokeWidth={1.5} />;
      default: return <File className="w-5 h-5" strokeWidth={1.5} />;
    }
  };

  const getTypeColor = () => {
    if (resource.type === 'document') {
      switch (docSubType) {
        case 'docx': return '#2b579a';
        case 'xlsx': return '#217346';
        case 'csv': return '#00838f';
        case 'txt': return '#6b7280';
        default: return 'var(--tertiary-text)';
      }
    }
    switch (resource.type) {
      case 'note': return 'var(--accent)';
      case 'notebook': return 'var(--success)';
      case 'image': return 'var(--brand-accent)';
      case 'video': return 'var(--info)';
      case 'audio': return 'var(--warning)';
      case 'pdf': return 'var(--error)';
      case 'url': return 'var(--brand-secondary)';
      case 'folder': return 'var(--accent)';
      default: return 'var(--tertiary-text)';
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
    const listGridStyle = {
      display: 'grid',
      gridTemplateColumns: '1fr 100px 130px 90px 44px',
      gap: 12,
      alignItems: 'center',
    };
    return (
      <div
        className={`group relative rounded-lg transition-colors border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--dome-bg-secondary)] ${isSelected ? 'bg-[var(--dome-accent-bg)] border-[var(--dome-accent)] z-10' : 'bg-[var(--dome-surface)]'
          } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ ...listGridStyle, padding: '8px 16px', height: '48px' }}
        onClick={(e) => onClick?.(e)}
        onContextMenu={handleContextMenu}
        role={onClick ? 'row' : undefined}
        aria-selected={isSelected}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? handleCardKeyDown : undefined}
        draggable={isDraggable}
        onDragStart={handleDragStart}
      >
        <div role="gridcell" className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center w-8 h-8 rounded shrink-0"
            style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
          >
            {getIcon()}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium truncate text-[var(--dome-text)]">
              {resource.title || 'Untitled'}
            </div>
            {searchSnippet && (
              <div className="text-xs text-[var(--dome-text-muted)] truncate max-w-[300px]">
                {searchSnippet}
              </div>
            )}
          </div>
        </div>
        <div role="gridcell" className="text-xs text-[var(--dome-text-muted)] capitalize truncate">
          {resource.type}
        </div>
        <div role="gridcell" className="text-xs text-[var(--dome-text-muted)] truncate tabular-nums">
          {resource.updated_at ? formatDistanceToNow(resource.updated_at) : '—'}
        </div>
        <div role="gridcell" className="text-xs text-[var(--dome-text-muted)] truncate tabular-nums">
          {resource.file_size != null ? formatFileSize(resource.file_size) : '—'}
        </div>
        <div role="gridcell" className="flex justify-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1.5 rounded-md hover:bg-[var(--error-bg)] text-[var(--dome-text-muted)] hover:text-[var(--error)] transition-colors"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className={`group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200 border ${isSelected
          ? 'ring-2 ring-[var(--dome-accent)] border-transparent shadow-md'
          : 'border-[var(--border)] bg-[var(--dome-surface)] hover:border-[var(--dome-accent-hover)] hover:shadow-md'
        } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ aspectRatio: 'var(--card-aspect-ratio, 4/3)' }}
      onClick={(e) => onClick?.(e)}
      onContextMenu={handleContextMenu}
      role={onClick ? 'button' : undefined}
      aria-selected={isSelected}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleCardKeyDown : undefined}
      draggable={isDraggable}
      onDragStart={handleDragStart}
    >
      {/* Preview Area */}
      <div
        className="relative flex-1 w-full bg-[var(--dome-bg-secondary)] overflow-hidden"
      >
        {hasThumbnail ? (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105"
            style={{ backgroundImage: thumbnail! }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center opacity-10 group-hover:opacity-15 transition-opacity" style={{ color: getTypeColor() }}>
            {/* Large icon for placeholder */}
            {resource.type === 'folder'
              ? <FolderOpen size={64} strokeWidth={1} />
              : <File size={48} strokeWidth={1} />
            }
          </div>
        )}

        {/* Play icon overlay for Video */}
        {resource.type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play size={20} className="ml-0.5 text-black" fill="currentColor" />
            </div>
          </div>
        )}

        {/* Time badge overlay */}
        {resource.updated_at && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/90 text-neutral-600 shadow-sm backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
            {formatShortDistance(resource.updated_at)}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="flex items-center gap-3 px-3 py-3 border-t border-[var(--border)] bg-[var(--dome-surface)]">
        <div
          className="flex items-center justify-center w-8 h-8 rounded shrink-0"
          style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
        >
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--dome-text)] truncate" title={resource.title}>
            {resource.title || 'Untitled'}
          </div>
          {(searchSnippet || searchOrigin) ? (
            <div className="text-xs text-[var(--dome-text-muted)] truncate">
              {searchSnippet || searchOrigin}
            </div>
          ) : (
            <div className="text-xs text-[var(--dome-text-muted)] truncate capitalize">
              {resource.type}
            </div>
          )}
        </div>
        {/* Context Menu Trigger (visible on hover) */}
        <button
          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--dome-bg)] text-[var(--dome-text-muted)] transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onContextMenu?.(e, resource);
          }}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>

      {resource.type === 'url' && resource.metadata && (
        <div className="absolute bottom-[52px] right-2">
          <ProcessingStatusBadge
            status={typeof resource.metadata === 'string'
              ? JSON.parse(resource.metadata).processing_status
              : resource.metadata.processing_status}
          />
        </div>
      )}
    </div>
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
