
import { useState, useRef, useEffect, memo } from 'react';
import type { Resource } from '@/types';
import { FileText, File, FileSpreadsheet, FileType, Table2, Video, Music, Image as ImageIcon, Link2, Trash2, Edit, MoreVertical, FolderOpen, FolderInput, Loader2, CheckCircle2, AlertCircle, Pencil } from 'lucide-react';
import { formatDistanceToNow, formatShortDistance } from '@/lib/utils';

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
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
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
    if (resource.thumbnail_data) {
      const isVideo = resource.type === 'video';
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.thumbnail_data})` }}
        >
          {isVideo && <div className="video-play-icon">▶</div>}
          {resource.type === 'video' && (
            <div className="time-badge">{formatShortDistance(resource.updated_at)}</div>
          )}
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

    // URL with preview
    if (resource.type === 'url' && resource.metadata?.preview_image) {
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.metadata.preview_image})` }}
        />
      );
    }

    // PDF thumbnail (legacy metadata)
    if (resource.type === 'pdf' && resource.metadata?.thumbnail) {
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.metadata.thumbnail})` }}
        />
      );
    }

    // Video thumbnail (legacy metadata)
    if (resource.type === 'video' && resource.metadata?.thumbnail) {
      return (
        <div
          className="preview-image"
          style={{ backgroundImage: `url(${resource.metadata.thumbnail})` }}
        >
          <div className="video-play-icon">▶</div>
        </div>
      );
    }

    // Note content preview
    if (resource.type === 'note' && resource.content) {
      const plainText = resource.content.replace(/<[^>]+>/g, '').substring(0, 200);
      return (
        <div className="content-preview">
          <p>{plainText}</p>
        </div>
      );
    }

    // Document content preview (text extracted at import time)
    if (resource.type === 'document' && resource.content) {
      const badge = getDocTypeBadge();
      const plainText = resource.content.substring(0, 200);
      return (
        <div className="content-preview document-preview">
          {badge && (
            <span
              className="doc-type-badge"
              style={{ background: badge.bg, color: badge.fg }}
            >
              {badge.label}
            </span>
          )}
          <p>{plainText}</p>
        </div>
      );
    }

    // Default icon preview
    return (
      <div className="icon-preview" style={{ color: getTypeColor() }}>
        {getIcon()}
      </div>
    );
  };

  if (viewMode === 'list') {
    return (
      <div
        className="resource-card-list"
        onClick={onClick}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
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
          {searchSnippet && (
            <div className="list-snippet" title={searchSnippet}>
              {searchSnippet}
            </div>
          )}
        </div>
        <div className="list-actions">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="action-btn"
              title="Edit"
            >
              <Edit size={16} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="action-btn delete"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <style jsx>{`
          .resource-card-list {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            transition: all var(--transition-fast);
          }

          .resource-card-list:hover {
            border-color: var(--accent);
            background: var(--bg-hover);
          }

          .list-icon {
            width: 40px;
            height: 40px;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .list-icon :global(.resource-icon) {
            width: 20px;
            height: 20px;
          }

          .list-content {
            flex: 1;
            min-width: 0;
          }

          .list-title {
            font-size: 14px;
            font-weight: 500;
            color: var(--primary-text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .list-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 2px;
            font-size: 12px;
            color: var(--tertiary-text);
          }

          .list-type {
            text-transform: capitalize;
          }

          .list-snippet {
            font-size: 11px;
            color: var(--secondary-text);
            margin-top: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .list-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity var(--transition-fast);
          }

          .resource-card-list:hover .list-actions {
            opacity: 1;
          }

          .action-btn {
            padding: 6px;
            background: transparent;
            border: none;
            border-radius: var(--radius-sm);
            color: var(--secondary-text);
            cursor: pointer;
            transition: all var(--transition-fast);
          }

          .action-btn:hover {
            background: var(--bg-tertiary);
            color: var(--primary-text);
          }

          .action-btn.delete:hover {
            background: var(--error-bg);
            color: var(--error);
          }
        `}</style>
      </div>
    );
  }

  // Grid view — overlay design
  const hasImagePreview = !!(
    resource.thumbnail_data ||
    (resource.type === 'image' && (resource.metadata?.preview_image || resource.file_path)) ||
    (resource.type === 'url' && resource.metadata?.preview_image) ||
    (resource.type === 'pdf' && resource.metadata?.thumbnail) ||
    (resource.type === 'video' && resource.metadata?.thumbnail)
  );

  return (
    <div
      className="resource-card-grid"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      {/* Full card preview area */}
      <div className="card-preview">
        {getPreviewContent()}
      </div>

      {/* Time badge — top right */}
      <div className="overlay-time-badge">
        {formatShortDistance(resource.updated_at)}
      </div>

      {/* 3-dot menu — top right, offset from time badge */}
      {(onEdit || onDelete || onMoveToFolder || onRename) && (
        <div className="overlay-menu">
          <button
            ref={buttonRef}
            className="overlay-menu-btn focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
            onClick={handleMenuToggle}
            aria-label="Options menu"
            aria-expanded={showMenu}
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <div
              ref={menuRef}
              className="dropdown-menu"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              {onRename && (
                <button
                  className="dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    setRenameValue(resource.title);
                    setIsRenaming(true);
                    setTimeout(() => renameInputRef.current?.focus(), 50);
                  }}
                >
                  <Pencil size={14} />
                  <span>Rename</span>
                </button>
              )}
              {onMoveToFolder && (
                <button
                  className="dropdown-item"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onMoveToFolder(); }}
                >
                  <FolderInput size={14} />
                  <span>Move to folder</span>
                </button>
              )}
              {onEdit && (
                <button
                  className="dropdown-item"
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
                >
                  <Edit size={14} />
                  <span>Edit</span>
                </button>
              )}
              {onDelete && (
                <>
                  <div className="dropdown-divider" />
                  <button
                    className="dropdown-item delete"
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

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
          {searchSnippet && (
            <div className="footer-snippet" title={searchSnippet}>
              {searchSnippet}
            </div>
          )}
        </div>
        {resource.type === 'url' && resource.metadata && (
          <ProcessingStatusBadge
            status={typeof resource.metadata === 'string'
              ? JSON.parse(resource.metadata).processing_status
              : resource.metadata.processing_status}
          />
        )}
      </div>

      <style jsx>{`
        .resource-card-grid {
          position: relative;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: all var(--transition-fast);
          aspect-ratio: 4/3;
        }

        .resource-card-grid:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .card-preview {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: var(--bg-tertiary);
        }

        .card-preview :global(.preview-image) {
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          position: relative;
        }

        .card-preview :global(.video-play-icon) {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 44px;
          height: 44px;
          background: rgba(0, 0, 0, 0.55);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
          backdrop-filter: blur(4px);
        }

        .card-preview :global(.content-preview) {
          padding: 16px;
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
        }

        .card-preview :global(.content-preview p) {
          font-size: 13px;
          color: var(--secondary-text);
          line-height: 1.6;
          display: -webkit-box;
          -webkit-line-clamp: 6;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .card-preview :global(.content-preview::after) {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 48px;
          background: linear-gradient(transparent, var(--bg-tertiary));
          pointer-events: none;
        }

        .card-preview :global(.document-preview) {
          position: relative;
        }

        .card-preview :global(.doc-type-badge) {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 8px;
          letter-spacing: 0.5px;
        }

        .card-preview :global(.time-badge) {
          display: none;
        }

        .card-preview :global(.icon-preview) {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }

        .card-preview :global(.icon-preview .resource-icon) {
          width: 40px;
          height: 40px;
          opacity: 0.4;
        }

        /* Overlay time badge */
        .overlay-time-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.55);
          color: white;
          font-size: 11px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 6px;
          backdrop-filter: blur(8px);
          z-index: 3;
          pointer-events: none;
        }

        /* Overlay menu (3-dot) */
        .overlay-menu {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 4;
          opacity: 0;
          transition: opacity var(--transition-fast);
        }

        .resource-card-grid:hover .overlay-menu {
          opacity: 1;
        }

        .overlay-menu-btn {
          padding: 5px;
          background: rgba(0, 0, 0, 0.45);
          border: none;
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all var(--transition-fast);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .overlay-menu-btn:hover {
          background: rgba(0, 0, 0, 0.7);
        }

        /* Overlay footer */
        .card-footer-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          z-index: 2;
        }

        .card-footer-overlay.on-image {
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
          color: white;
          padding-top: 28px;
        }

        .card-footer-overlay.on-content {
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
          color: var(--primary-text);
        }

        .footer-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }

        .footer-icon :global(.resource-icon) {
          width: 16px;
          height: 16px;
        }

        .footer-info {
          flex: 1;
          min-width: 0;
        }

        .footer-title {
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-footer-overlay.on-image .footer-title {
          color: white;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .footer-snippet {
          font-size: 10px;
          opacity: 0.7;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .footer-title-input {
          width: 100%;
          padding: 2px 4px;
          border: 1px solid var(--accent);
          border-radius: 4px;
          background: var(--bg);
          color: var(--primary-text);
          font-size: 12px;
          font-weight: 600;
          outline: none;
        }

        /* Dropdown (shared with both layouts) */
        .dropdown-menu {
          position: fixed;
          z-index: 9999;
          min-width: 180px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15), 0 2px 10px rgba(0, 0, 0, 0.1);
          padding: 6px;
          animation: dropdown-appear 0.15s ease-out;
        }

        @keyframes dropdown-appear {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: var(--radius-md);
          color: var(--primary-text);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          text-align: left;
          transition: all var(--transition-fast);
        }

        .dropdown-item:hover {
          background: var(--bg-secondary);
        }

        .dropdown-item.delete {
          color: var(--error);
        }

        .dropdown-item.delete:hover {
          background: var(--error-bg);
        }

        .dropdown-divider {
          height: 1px;
          background: var(--border);
          margin: 4px 0;
        }
      `}</style>
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
