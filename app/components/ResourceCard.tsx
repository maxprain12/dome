'use client';

import { useState, useRef, useEffect, memo } from 'react';
import type { Resource } from '@/types';
import { FileText, File, Video, Music, Image as ImageIcon, Link2, Trash2, Edit, MoreVertical, FolderOpen, FolderInput, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from '@/lib/utils';

interface ResourceCardProps {
  resource: Resource;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveToFolder?: () => void;
  viewMode?: 'grid' | 'list';
  searchSnippet?: string;
}

function ProcessingStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'completed') return null;

  const statusConfig = {
    pending: { icon: Loader2, color: 'var(--warning)', label: 'Pending' },
    processing: { icon: Loader2, color: 'var(--brand-primary)', label: 'Processing', spinning: true },
    failed: { icon: AlertCircle, color: 'var(--error)', label: 'Failed' },
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
  onMoveToFolder,
  viewMode = 'grid',
  searchSnippet,
}: ResourceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Position the menu when opened
  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 180;
      const menuHeight = 150; // approximate

      // Calculate position - prefer bottom-right, but adjust if near edges
      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;

      // Check if menu would go off-screen
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
  const getIcon = () => {
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
      default:
        return <File className="resource-icon" />;
    }
  };

  const getTypeColor = () => {
    switch (resource.type) {
      case 'note':
        return 'var(--brand-primary)';
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
      default:
        return 'var(--tertiary)';
    }
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
        />
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
            border-color: var(--brand-primary);
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
            color: var(--primary);
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
            color: var(--tertiary);
          }

          .list-type {
            text-transform: capitalize;
          }

          .list-snippet {
            font-size: 11px;
            color: var(--secondary);
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
            color: var(--secondary);
            cursor: pointer;
            transition: all var(--transition-fast);
          }

          .action-btn:hover {
            background: var(--bg-tertiary);
            color: var(--primary);
          }

          .action-btn.delete:hover {
            background: var(--error-bg);
            color: var(--error);
          }
        `}</style>
      </div>
    );
  }

  // Grid view
  return (
    <div
      className="resource-card-grid"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="card-preview">
        {getPreviewContent()}
      </div>
        <div className="card-footer">
          <div className="card-icon" style={{ color: getTypeColor() }}>
            {getIcon()}
          </div>
          <div className="card-info">
            <div className="card-title">{resource.title || 'Untitled'}</div>
            <div className="card-date">
              {formatDistanceToNow(resource.updated_at)}
              {resource.type === 'url' && resource.metadata && (
                <ProcessingStatusBadge 
                  status={typeof resource.metadata === 'string' 
                    ? JSON.parse(resource.metadata).processing_status 
                    : resource.metadata.processing_status} 
                />
              )}
            </div>
            {searchSnippet && (
              <div className="card-snippet" title={searchSnippet}>
                {searchSnippet}
              </div>
            )}
          </div>
        {(onEdit || onDelete || onMoveToFolder) && (
          <div className="card-actions">
            <button
              ref={buttonRef}
              className="menu-btn focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
              onClick={handleMenuToggle}
              aria-label="Menú de opciones"
              aria-expanded={showMenu}
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div
                ref={menuRef}
                className="dropdown-menu"
                style={{ top: menuPosition.top, left: menuPosition.left }}
              >
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
      </div>

      <style jsx>{`
        .resource-card-grid {
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          overflow: hidden;
          transition: all var(--transition-fast);
        }

        .resource-card-grid:hover {
          border-color: var(--brand-primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .card-preview {
          aspect-ratio: 4/3;
          background: var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
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
          width: 48px;
          height: 48px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 18px;
        }

        .card-preview :global(.content-preview) {
          padding: 12px;
          width: 100%;
          height: 100%;
          overflow: hidden;
        }

        .card-preview :global(.content-preview p) {
          font-size: 12px;
          color: var(--secondary);
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin: 0;
        }

        .card-preview :global(.icon-preview) {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .card-preview :global(.icon-preview .resource-icon) {
          width: 48px;
          height: 48px;
          opacity: 0.8;
        }

        .card-footer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border-top: 1px solid var(--border);
        }

        .card-icon :global(.resource-icon) {
          width: 16px;
          height: 16px;
        }

        .card-info {
          flex: 1;
          min-width: 0;
        }

        .card-title {
          font-size: 13px;
          font-weight: 500;
          color: var(--primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-date {
          font-size: 11px;
          color: var(--tertiary);
          margin-top: 2px;
        }

        .card-snippet {
          font-size: 11px;
          color: var(--secondary);
          margin-top: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-actions {
          opacity: 0;
          transition: opacity var(--transition-fast);
          position: static;
        }

        .resource-card-grid:hover .card-actions {
          opacity: 1;
        }

        .menu-btn {
          padding: 6px;
          background: var(--bg-tertiary);
          border: none;
          border-radius: var(--radius-sm);
          color: var(--secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .menu-btn:hover {
          background: var(--bg-hover);
          color: var(--primary);
        }

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
          color: var(--primary);
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
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.searchSnippet === nextProps.searchSnippet
  );
});
