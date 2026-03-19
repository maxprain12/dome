import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  BookOpen,
  Globe,
  File,
  Image,
  Music,
  Video,
  Presentation,
  RefreshCw,
  Search,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit3,
  Copy,
  FolderPlus,
  FilePlus,
} from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/lib/hooks/useResources';

type TreeNodeData = {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'note' | 'notebook' | 'url' | 'youtube' | 'pdf' | 'document' | 'image' | 'audio' | 'video' | 'ppt' | 'file';
  children?: TreeNodeData[];
};

interface FileManagerTreeProps {
  compact?: boolean;
  onRefresh?: () => void;
}

function getResourceIcon(type: string, className: string = "w-4 h-4") {
  switch (type) {
    case 'note':
      return <FileText className={className} strokeWidth={1.75} />;
    case 'notebook':
      return <BookOpen className={className} strokeWidth={1.75} />;
    case 'url':
      return <Globe className={className} strokeWidth={1.75} />;
    case 'youtube':
    case 'video':
      return <Video className={className} strokeWidth={1.75} />;
    case 'pdf':
    case 'document':
      return <File className={className} strokeWidth={1.75} />;
    case 'image':
      return <Image className={className} strokeWidth={1.75} />;
    case 'audio':
      return <Music className={className} strokeWidth={1.75} />;
    case 'ppt':
      return <Presentation className={className} strokeWidth={1.75} />;
    case 'folder':
      return <Folder className={className} strokeWidth={1.75} />;
    default:
      return <File className={className} strokeWidth={1.75} />;
  }
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: TreeNodeData | null;
}

interface TreeNodeComponentProps {
  node: TreeNodeData;
  depth: number;
  onToggle: (id: string) => void;
  expandedIds: Set<string>;
  onContextMenu: (e: React.MouseEvent, node: TreeNodeData) => void;
  onSelect: (node: TreeNodeData) => void;
  compact?: boolean;
}

function TreeNodeComponent({
  node,
  depth,
  onToggle,
  expandedIds,
  onContextMenu,
  onSelect,
  compact = false,
}: TreeNodeComponentProps) {
  const isFolder = node.type === 'folder';
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = isFolder && node.children && node.children.length > 0;

  const handleClick = () => {
    if (isFolder) {
      onToggle(node.id);
    } else {
      onSelect(node);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, node);
  };

  const paddingLeft = compact ? 8 + depth * 12 : 12 + depth * 16;
  const height = compact ? 28 : 32;
  const iconSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className="flex items-center w-full text-left transition-colors duration-100 rounded-md"
        style={{
          gap: 6,
          paddingLeft: paddingLeft,
          paddingRight: 8,
          height,
          fontSize: compact ? 12 : 13,
          color: 'var(--dome-text-secondary)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          minWidth: 0,
        }}
        title={node.name}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-secondary)';
        }}
      >
        <span className="shrink-0 flex items-center justify-center" style={{ width: 14, height: 14 }}>
          {isFolder ? (
            hasChildren || isExpanded ? (
              <ChevronDown className="w-3 h-3" strokeWidth={2.5} />
            ) : (
              <ChevronRight className="w-3 h-3" strokeWidth={2.5} />
            )
          ) : (
            <span style={{ width: 12 }} />
          )}
        </span>
        <span className="shrink-0 flex items-center" style={{ color: isFolder ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}>
          {getResourceIcon(node.type, iconSize)}
        </span>
        <span className="truncate flex-1" style={{ lineHeight: 1.3 }}>{node.name}</span>
      </button>

      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              expandedIds={expandedIds}
              onContextMenu={onContextMenu}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ContextMenu({ state, onClose, onAction }: {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string, node: TreeNodeData) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (!state.visible || !state.node) return null;

  const isFolder = state.node.type === 'folder';
  const menuItems = [
    { action: 'rename', label: 'Rename', icon: <Edit3 className="w-3.5 h-3.5" /> },
    { action: 'duplicate', label: 'Duplicate', icon: <Copy className="w-3.5 h-3.5" /> },
    ...(isFolder ? [
      { action: 'new-folder', label: 'New Folder', icon: <FolderPlus className="w-3.5 h-3.5" /> },
      { action: 'new-file', label: 'New File', icon: <FilePlus className="w-3.5 h-3.5" /> },
    ] : []),
    { action: 'delete', label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg shadow-xl border overflow-hidden"
      style={{
        left: state.x,
        top: state.y,
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
      }}
    >
      {menuItems.map((item) => (
        <button
          key={item.action}
          type="button"
          onClick={() => {
            onAction(item.action, state.node!);
            onClose();
          }}
          className="flex items-center gap-2 w-full text-left px-3 py-2 transition-colors"
          style={{
            fontSize: 13,
            color: item.danger ? 'var(--dome-error)' : 'var(--dome-text)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <span className="shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function buildTreeFromResources(resources: Resource[]): TreeNodeData[] {
  const folderMap = new Map<string, TreeNodeData>();
  const rootNodes: TreeNodeData[] = [];

  const folders = resources.filter((r) => r.type === 'folder');
  const nonFolders = resources.filter((r) => r.type !== 'folder');

  for (const folder of folders) {
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.title,
      path: folder.id,
      type: 'folder',
      children: [],
    });
  }

  for (const resource of nonFolders) {
    const node: TreeNodeData = {
      id: resource.id,
      name: resource.title,
      path: resource.id,
      type: resource.type as TreeNodeData['type'],
    };

    if (resource.folder_id && folderMap.has(resource.folder_id)) {
      folderMap.get(resource.folder_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  for (const folder of folders) {
    const node = folderMap.get(folder.id)!;
    if (folder.folder_id && folderMap.has(folder.folder_id)) {
      folderMap.get(folder.folder_id)!.children!.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  return rootNodes;
}

export function FileManagerTree({ compact = false, onRefresh }: FileManagerTreeProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [loading, setLoading] = useState(true);
  const { openResourceTab } = useTabStore.getState();

  const fetchResources = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.resources) return;
    try {
      setLoading(true);
      const result = await window.electron.db.resources.getAll(500);
      if (result?.success && result.data) {
        setResources(result.data as Resource[]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const unsubCreate = window.electron.on('resource:created', () => fetchResources());
    const unsubUpdate = window.electron.on('resource:updated', () => fetchResources());
    const unsubDelete = window.electron.on('resource:deleted', () => fetchResources());
    return () => {
      unsubCreate?.();
      unsubUpdate?.();
      unsubDelete?.();
    };
  }, [fetchResources]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((node: TreeNodeData) => {
    openResourceTab(node.id, node.type, node.name);
  }, [openResourceTab]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNodeData) => {
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  }, []);

  const handleContextMenuAction = useCallback(async (action: string, node: TreeNodeData) => {
    switch (action) {
      case 'delete':
        if (confirm(`Delete "${node.name}"?`)) {
          await window.electron?.db?.resources?.delete(node.id);
        }
        break;
      case 'rename':
        const newName = prompt('New name:', node.name);
        if (newName && newName !== node.name) {
          await window.electron?.db?.resources?.update({ id: node.id, title: newName });
        }
        break;
      case 'new-folder':
        const folderName = prompt('Folder name:');
        if (folderName) {
          await window.electron?.db?.resources?.create({
            type: 'folder',
            title: folderName,
            folder_id: node.type === 'folder' ? node.id : node.path === 'root' ? null : undefined,
          });
          if (node.type === 'folder') {
            setExpandedIds((prev) => new Set(prev).add(node.id));
          }
        }
        break;
      case 'new-file':
        const fileName = prompt('File name:');
        if (fileName) {
          await window.electron?.db?.resources?.create({
            type: 'note',
            title: fileName,
            folder_id: node.type === 'folder' ? node.id : node.path === 'root' ? null : undefined,
          });
          if (node.type === 'folder') {
            setExpandedIds((prev) => new Set(prev).add(node.id));
          }
        }
        break;
    }
  }, []);

  const tree = buildTreeFromResources(resources);

  const q = searchQuery.trim().toLowerCase();

  const filterTree = (nodes: TreeNodeData[]): TreeNodeData[] => {
    if (!q) return nodes;
    return nodes.reduce<TreeNodeData[]>((acc, node) => {
      const matches = node.name.toLowerCase().includes(q);
      const filteredChildren = node.children ? filterTree(node.children) : undefined;
      if (matches || (filteredChildren && filteredChildren.length > 0)) {
        acc.push({
          ...node,
          children: filteredChildren,
        });
      }
      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {!compact && (
        <div className="px-3 py-2">
          <div
            className="flex items-center gap-1.5 rounded-md px-2"
            style={{
              height: 28,
              background: 'var(--dome-bg-hover)',
              border: '1px solid var(--dome-border)',
            }}
          >
            <Search className="w-3 h-3 shrink-0" style={{ color: 'var(--dome-text-muted)' }} strokeWidth={2} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="flex-1 bg-transparent outline-none border-none"
              style={{
                fontSize: 12,
                color: 'var(--dome-text)',
                caretColor: 'var(--dome-accent)',
              }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredTree.length === 0 ? (
          <p className="text-center py-4" style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
            {q ? 'No results found' : 'No resources yet'}
          </p>
        ) : (
          filteredTree.map((node) => (
            <TreeNodeComponent
              key={node.id}
              node={node}
              depth={0}
              onToggle={handleToggle}
              expandedIds={expandedIds}
              onContextMenu={handleContextMenu}
              onSelect={handleSelect}
              compact={compact}
            />
          ))
        )}
      </div>

      {onRefresh && (
        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md transition-colors"
            style={{
              fontSize: 12,
              color: 'var(--dome-text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted)';
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      )}

      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu((s) => ({ ...s, visible: false }))}
        onAction={handleContextMenuAction}
      />
    </div>
  );
}

export type { TreeNodeData };
