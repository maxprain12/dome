
import { useState, useRef, useEffect, memo } from 'react';
import type { Resource } from '@/types';
import { FileText, File, FileSpreadsheet, FileType, Table2, Video, Music, Image as ImageIcon, Link2, Trash2, Edit, MoreVertical, FolderOpen, FolderInput, Loader2, CheckCircle2, AlertCircle, Pencil, Notebook, Play } from 'lucide-react';
import { formatDistanceToNow, formatShortDistance, extractPlainTextFromTiptap } from '@/lib/utils';

interface ResourceCardProps {
  resource: Resource;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  onMoveToFolder?: () => void;
  viewMode?: 'grid' | 'list';
  searchSnippet?: string;
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
      className="processing-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        marginLeft: '8px',
        fontSize: '11px',
        color: config.color,
      }}
    >
      <Icon
        size={12}
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
  onEdit,
  onDelete,
  onRename,
  onMoveToFolder,
  viewMode = 'grid',
  searchSnippet,
}: ResourceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(resource.title);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position the menu when opened
  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = 150; // approximate

      // Calculate position - align dropdown below button, left-aligned
      let top = rect.bottom + 4;
      let left = rect.left;

      // Check if menu would go off-screen
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      if (left < 8) left = 8;
      if (top + menuHeight > window.innerHeight - 8) {
        top = rect.top - menuHeight - 4;
      }

      setMenuPosition({ top, left });
    }
    setShowMenu(!showMenu);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    const handleScroll = () => {
      setShowMenu(false);
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true, passive: true });
    };
  }, [showMenu]);
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
        case 'docx':
          return <FileText className="resource-icon" />;
        case 'xlsx':
          return <FileSpreadsheet className="resource-icon" />;
        case 'csv':
          return <Table2 className="resource-icon" />;
        case 'txt':
          return <FileType className="resource-icon" />;
        default:
          return <File className="resource-icon" />;
      }
    }

    switch (resource.type) {
      case 'note':
        return <FileText className="resource-icon" />;
      case 'notebook':
        return <Notebook className="resource-icon" />;
      case 'pdf':
        return <File className="resource-icon" />;
      case 'video':
        return <Video className="resource-icon" />;
      case 'audio':
        return <Music className="resource-icon" />;
      case 'image':
        return <ImageIcon className="resource-icon" />;
      case 'url':
        return <Link2 className="resource-icon" />;
      case 'folder':
        return <FolderOpen className="resource-icon" />;
      default:
        return <File className="resource-icon" />;
    }
  };

  const getTypeColor = () => {
    // Document sub-type specific colors
    if (resource.type === 'document') {
      switch (docSubType) {
        case 'docx': return '#2b579a';
        case 'xlsx': return '#217346';
        case 'csv': return '#00838f';
        case 'txt': return '#6b7280';
        default: return 'var(--tertiary)';
      }
    }

    switch (resource.type) {
      case 'note':
        return 'var(--accent)';
      case 'notebook':
        return 'var(--success)';
      case 'image':
        return 'var(--brand-accent)';
      case 'video':
        return 'var(--info)';
      case 'audio':
        return 'var(--warning)';
      case 'pdf':
        return 'var(--error)';
      case 'url':
        return 'var(--brand-secondary)';
      case 'folder':
        return 'var(--accent)';
      default:
        return 'var(--tertiary)';
    }
  };

  // Get document sub-type label for badge
  const getDocTypeBadge = () => {
    const labels: Record<string, { label: string; bg: string; fg: string }> = {
      docx: { label: 'DOCX', bg: '#e8f0fe', fg: '#2b579a' },
      xlsx: { label: 'XLSX', bg: '#e6f4ea', fg: '#217346' },
      csv: { label: 'CSV', bg: '#e0f7fa', fg: '#00838f' },
      txt: { label: 'TXT', bg: '#f3f4f6', fg: '#6b7280' },
    };
    return labels[docSubType] || null;
  };

  const getPreviewContent = () => {
    // Use thumbnail_data (Base64) for fast preview - new internal storage system
    // PDF: no mostramos thumbnail, solo icono
    if (resource.thumbnail_data && resource.type !== 'pdf') {
      const isVideo = resource.type === 'video';
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.thumbnail_data})` }}
        >
          {isVideo && <div className="video-play-icon"><Play size={20} fill="currentColor" /></div>}
          {resource.type === 'video' ? (
            <div className="time-badge">{formatShortDistance(resource.updated_at)}</div>
          ) : null}
        </div>
      );
    }

    // Image preview (legacy: file_path or metadata)
    if (resource.type === 'image' && (resource.metadata?.preview_image || resource.file_path)) {
      const imageSrc = resource.metadata?.preview_image || resource.file_path;
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${imageSrc})` }}
        >
          <div className="time-badge">{formatShortDistance(resource.updated_at)}</div>
        </div>
      );
    }

    // URL with preview image
    if (resource.type === 'url' && resource.metadata?.preview_image) {
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.metadata.preview_image})` }}
        />
      );
    }

    // URL without image: rich preview with metadata (title, author, summary)
    if (resource.type === 'url' && !resource.thumbnail_data) {
      const meta = resource.metadata && typeof resource.metadata === 'object' ? resource.metadata : {} as Record<string, unknown>;
      const nested = (meta.metadata as Record<string, unknown> | undefined) ?? {};
      const title = (meta.title ?? nested.title ?? resource.title) as string | undefined;
      const author = (meta.author ?? nested.author) as string | undefined;
      const publishedDate = (meta.published_date ?? nested.published_date) as string | undefined;
      const summary = (meta.summary ?? meta.description ?? nested.description) as string | undefined;
      const scrapedContent = (meta.scraped_content ?? meta.content) as string | undefined;
      const excerptSource = summary || (scrapedContent ? extractPlainTextFromTiptap(String(scrapedContent)) : '');
      const excerpt = excerptSource ? excerptSource.substring(0, 150).trim() + (excerptSource.length >= 150 ? '…' : '') : '';
      if (title || excerpt || author) {
        return (
          <div className="content-preview content-preview-url">
            {title ? <div className="url-preview-title">{title}</div> : null}
            {author || publishedDate ? (
              <div className="url-preview-meta">
                {author}{author && publishedDate ? ' · ' : ''}
                {publishedDate ? new Date(publishedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
              </div>
            ) : null}
            {excerpt ? <p className="url-preview-excerpt">{excerpt}</p> : null}
          </div>
        );
      }
    }

    // Video thumbnail (legacy metadata)
    if (resource.type === 'video' && resource.metadata?.thumbnail) {
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.metadata.thumbnail})` }}
        >
          <div className="video-play-icon"><Play size={20} fill="currentColor" /></div>
        </div>
      );
    }

    // Note content preview (Tiptap/ProseMirror JSON)
    if (resource.type === 'note' && resource.content) {
      const plainText = extractPlainTextFromTiptap(resource.content);
      if (plainText) {
        const preview = plainText.substring(0, 200).trim();
        return (
          <div className="content-preview">
            <p>{preview}{preview.length >= 200 ? '…' : ''}</p>
          </div>
        );
      }
    }

    // Document content preview (text extracted at import time)
    if (resource.type === 'document' && resource.content) {
      const badge = getDocTypeBadge();
      const plainText = extractPlainTextFromTiptap(resource.content).substring(0, 200);
      return (
        <div className="content-preview document-preview">
          {badge ? (
            <span
              className="doc-type-badge"
              style={{ background: badge.bg, color: badge.fg }}
            >
              {badge.label}
            </span>
          ) : null}
          <p>{plainText}</p>
        </div>
      );
    }

    // Notebooks: preview genérico (icono), sin extracto de contenido
    // Icon preview con placeholder amigable para notas/notebooks vacíos
    const isEmptyNoteOrNotebook = (resource.type === 'note' || resource.type === 'notebook')
      && (!resource.content || resource.content.trim().length < 10);
    return (
      <div className={`icon-preview ${isEmptyNoteOrNotebook ? 'icon-preview-empty' : ''}`} style={{ color: getTypeColor() }}>
        {getIcon()}
        {isEmptyNoteOrNotebook && (
          <span className="icon-preview-hint">
            {resource.type === 'notebook' ? 'Cuaderno vacío' : 'Nota vacía'}
          </span>
        )}
      </div>
    );
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`resource-card-list content-visibility-auto ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? handleCardKeyDown : undefined}
      >
        <div
          className="list-icon"
          style={{ background: `${getTypeColor()}15`, color: getTypeColor() }}
        >
          {getIcon()}
        </div>
        <div className="list-content">
          <div className="list-title">{resource.title || 'Untitled'}</div>
          <div className="list-meta">
            <span className="list-type">{resource.type}</span>
            <span>·</span>
            <span>{formatDistanceToNow(resource.updated_at)}</span>
          </div>
          {searchSnippet ? (
            <div className="list-snippet" title={searchSnippet}>
              {searchSnippet}
            </div>
          ) : null}
        </div>
        <div className="list-actions">
          {onEdit ? (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="action-btn"
              title="Editar"
              aria-label="Editar"
            >
              <Edit size={16} />
            </button>
          ) : null}
          {onDelete ? (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="action-btn delete"
              title="Eliminar"
              aria-label="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>

      </div>
    );
  }

  // Grid view — overlay design
  const hasImagePreview = !!(
    (resource.thumbnail_data && resource.type !== 'pdf') ||
    (resource.type === 'image' && (resource.metadata?.preview_image || resource.file_path)) ||
    (resource.type === 'url' && resource.metadata?.preview_image) ||
    (resource.type === 'video' && resource.metadata?.thumbnail)
  );

  const typeClass = `resource-type-${resource.type}`;

  return (
    <div
      className={`resource-card-grid content-visibility-auto ${typeClass} ${hasImagePreview ? 'has-image-preview' : ''} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? handleCardKeyDown : undefined}
    >
      {/* Full card preview area */}
      <div className="card-preview">
        {getPreviewContent()}
      </div>

      {/* Time badge — top right */}
      <div className="overlay-time-badge">
        {formatShortDistance(resource.updated_at)}
      </div>

      {/* Actions overlay — top left: delete (direct) + 3-dot menu */}
      {(onEdit || onDelete || onMoveToFolder || onRename) ? (
          <div className="overlay-menu">
          {onDelete ? (
            <button
              className="overlay-menu-btn overlay-delete-btn focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              aria-label="Eliminar"
              title="Eliminar"
            >
              <Trash2 size={14} />
            </button>
          ) : null}
          <button
            ref={buttonRef}
            className="overlay-menu-btn focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
            onClick={handleMenuToggle}
            aria-label="Options menu"
            aria-expanded={showMenu}
          >
            <MoreVertical size={14} />
          </button>
          {showMenu ? (
            <div
              ref={menuRef}
              className="dropdown-menu"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {onRename ? (
                <button
                  className="dropdown-item cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setRenameValue(resource.title);
                    setIsRenaming(true);
                    setTimeout(() => renameInputRef.current?.focus(), 50);
                  }}
                  aria-label="Rename"
                >
                  <Pencil size={14} />
                  <span>Rename</span>
                </button>
              ) : null}
              {onMoveToFolder ? (
                <button
                  className="dropdown-item cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onMoveToFolder(); }}
                  aria-label="Move to folder"
                >
                  <FolderInput size={14} />
                  <span>Move to folder</span>
                </button>
              ) : null}
              {onEdit ? (
                <button
                  className="dropdown-item cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
                  aria-label="Edit"
                >
                  <Edit size={14} />
                  <span>Edit</span>
                </button>
              ) : null}
              {onDelete ? (
                <>
                  <div className="dropdown-divider" />
                  <button
                    className="dropdown-item delete cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                    aria-label="Delete"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Overlay footer — bottom */}
      <div className={`card-footer-overlay ${hasImagePreview ? 'on-image' : 'on-content'}`}>
        <div className="footer-icon" style={{ color: hasImagePreview ? 'white' : getTypeColor() }}>
          {getIcon()}
        </div>
        <div className="footer-info">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="footer-title-input"
              value={renameValue}
              aria-label="Rename resource"
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (renameValue.trim() && renameValue !== resource.title && onRename) {
                    onRename(renameValue.trim());
                  }
                  setIsRenaming(false);
                }
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setRenameValue(resource.title);
                }
              }}
              onBlur={() => {
                if (renameValue.trim() && renameValue !== resource.title && onRename) {
                  onRename(renameValue.trim());
                }
                setIsRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="footer-title">{resource.title || 'Untitled'}</div>
          )}
          {searchSnippet ? (
            <div className="footer-snippet" title={searchSnippet}>
              {searchSnippet}
            </div>
          ) : null}
        </div>
        {resource.type === 'url' && resource.metadata ? (
          <ProcessingStatusBadge
            status={typeof resource.metadata === 'string'
              ? JSON.parse(resource.metadata).processing_status
              : resource.metadata.processing_status}
          />
        ) : null}
      </div>

    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparator: solo re-renderizar si props relevantes cambiaron
  return (
    prevProps.resource.id === nextProps.resource.id &&
    prevProps.resource.title === nextProps.resource.title &&
    prevProps.resource.updated_at === nextProps.resource.updated_at &&
    prevProps.resource.type === nextProps.resource.type &&
    prevProps.resource.content === nextProps.resource.content &&
    prevProps.resource.thumbnail_data === nextProps.resource.thumbnail_data &&
    prevProps.resource.file_mime_type === nextProps.resource.file_mime_type &&
    prevProps.resource.original_filename === nextProps.resource.original_filename &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.searchSnippet === nextProps.searchSnippet
  );
});
