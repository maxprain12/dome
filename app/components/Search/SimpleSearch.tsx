import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Plus,
  Upload,
  Link2,
  X,
  FileText,
  File,
  Video,
  Music,
  Image as ImageIcon,
  Notebook,
  Presentation,
  FolderOpen,
  MessageSquare,
  Sparkles,
  GitBranch,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';

interface SearchResult {
  id: string;
  title: string;
  type: string;
  updated_at?: number;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  note:         <FileText     className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  notebook:     <Notebook     className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  pdf:          <File         className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  video:        <Video        className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  audio:        <Music        className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  image:        <ImageIcon    className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  url:          <Link2        className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  ppt:          <Presentation className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  document:     <File         className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  folder:       <FolderOpen   className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  chat:         <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  annotation:   <FileText     className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  studio:       <Sparkles     className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
  graph:        <GitBranch    className="h-4 w-4 shrink-0" strokeWidth={1.5} />,
};

function formatDistanceToNow(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return new Date(timestamp).toLocaleDateString();
  }
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

interface UseSimpleSearchOptions {
  onResourceSelect?: (resource: { id: string; type: string; title: string }) => void;
}

export function useSimpleSearch({ onResourceSelect }: UseSimpleSearchOptions = {}) {
  const { t } = useTranslation();
  const currentProject = useAppStore((s) => s.currentProject);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open();
      }
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, open, close]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (window.electron?.db?.search?.unified) {
          const result = await window.electron.db.search.unified(query);
          if (result.success && result.data?.resources) {
            setResults(result.data.resources.slice(0, 10));
          }
        }
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note'),
      content: '',
      project_id: currentProject?.id ?? 'default',
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      onResourceSelect?.({ id: result.data.id, type: 'note', title: result.data.title });
    }
    close();
  }, [close, currentProject?.id, onResourceSelect, t]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (paths?.length) {
      await window.electron.resource.importMultiple(paths, currentProject?.id ?? 'default');
    }
    close();
  }, [close, currentProject?.id]);

  const handleAddUrl = useCallback(() => {
    const url = prompt(t('command.please_enter_url'));
    if (url && window.electron?.db?.resources?.create) {
      const now = Date.now();
      const id = `res_${now}_${Math.random().toString(36).substr(2, 9)}`;
      const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      window.electron.db.resources.create({
        id,
        type: 'url',
        title,
        project_id: currentProject?.id ?? 'default',
        content: url,
        created_at: now,
        updated_at: now,
      }).catch(console.error);
    }
    close();
  }, [close, currentProject?.id, t]);

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      onResourceSelect?.(result);
      close();
    },
    [onResourceSelect, close]
  );

  return {
    isOpen,
    query,
    setQuery,
    results,
    isSearching,
    inputRef,
    containerRef,
    open,
    close,
    handleNewNote,
    handleUpload,
    handleAddUrl,
    handleResultClick,
  };
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-[var(--dome-accent)]"
      style={{
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        color: 'var(--dome-text-muted)',
      }}
    >
      <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
      <span>Search...</span>
      <kbd
        className="ml-2 rounded border px-1.5 py-0.5 text-xs"
        style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)' }}
      >
        ⌘K
      </kbd>
    </button>
  );
}

interface SearchModalProps {
  query: string;
  setQuery: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  isOpen: boolean;
  close: () => void;
  handleNewNote: () => void;
  handleUpload: () => void;
  handleAddUrl: () => void;
  handleResultClick: (result: SearchResult) => void;
}

export function SearchModal({
  query,
  setQuery,
  results,
  isSearching,
  inputRef,
  containerRef,
  isOpen,
  close,
  handleNewNote,
  handleUpload,
  handleAddUrl,
  handleResultClick,
}: SearchModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl"
        style={{
          background: 'var(--dome-bg)',
          borderColor: 'var(--dome-border)',
        }}
      >
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--dome-border)' }}
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search resources..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--dome-text)' }}
            autoComplete="off"
          />
          {isSearching && (
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--dome-accent)', borderTopColor: 'transparent' }}
            />
          )}
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="rounded p-0.5 hover:bg-[var(--dome-surface)]"
            >
              <X className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
            </button>
          )}
          <button
            type="button"
            onClick={close}
            className="rounded border px-2 py-1 text-xs transition-colors hover:bg-[var(--dome-surface)]"
            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            ESC
          </button>
        </div>

        {!query && (
          <div className="p-4">
            <p className="mb-3 text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>
              Quick Actions
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleNewNote}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-[var(--dome-accent)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--dome-accent)' }} />
                New Note
              </button>
              <button
                type="button"
                onClick={handleUpload}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-[var(--dome-accent)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Upload className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--dome-accent)' }} />
                Upload
              </button>
              <button
                type="button"
                onClick={handleAddUrl}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-[var(--dome-accent)]"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
              >
                <Link2 className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--dome-accent)' }} />
                Add URL
              </button>
            </div>
          </div>
        )}

        {query && results.length > 0 && (
          <div className="max-h-80 overflow-y-auto p-2">
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => handleResultClick(result)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--dome-surface)]"
              >
                <span style={{ color: 'var(--dome-text-muted)' }}>
                  {TYPE_ICONS[result.type] || <File className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                </span>
                <span className="flex-1 truncate text-sm" style={{ color: 'var(--dome-text)' }}>
                  {result.title || 'Untitled'}
                </span>
                {result.updated_at && (
                  <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {formatDistanceToNow(result.updated_at * 1000)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {query && !isSearching && results.length === 0 && (
          <div className="p-8 text-center">
            <Search className="mx-auto h-8 w-8 mb-2" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              No results found
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function SimpleSearch({ onResourceSelect }: { onResourceSelect?: (resource: { id: string; type: string; title: string }) => void }) {
  const search = useSimpleSearch({ onResourceSelect });

  return (
    <>
      <SearchButton onClick={search.open} />
      <SearchModal {...search} />
    </>
  );
}

// ─── Advanced Inline Search ───────────────────────────────────────────────────

interface AdvancedResult {
  id: string;
  title: string;
  type: string;
  category: 'resource' | 'interaction' | 'studio' | 'graph';
  snippet?: string;
  updated_at?: number;
  /** For interactions: the parent resource title */
  parentTitle?: string;
  parentType?: string;
  /** For folders: custom color from metadata */
  folderColor?: string;
}

const DEFAULT_TYPE_META = { label: 'Nota', color: '#7c6fcd', bg: 'rgba(124,111,205,0.1)' };

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  note:         { label: 'Nota',         color: '#7c6fcd', bg: 'rgba(124,111,205,0.1)' },
  notebook:     { label: 'Cuaderno',     color: '#7c6fcd', bg: 'rgba(124,111,205,0.1)' },
  pdf:          { label: 'PDF',          color: '#e05c5c', bg: 'rgba(224,92,92,0.1)'   },
  video:        { label: 'Video',        color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  audio:        { label: 'Audio',        color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)'  },
  image:        { label: 'Imagen',       color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  url:          { label: 'Enlace',       color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  folder:       { label: 'Carpeta',      color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  ppt:          { label: 'PPT',          color: '#f97316', bg: 'rgba(249,115,22,0.1)'  },
  document:     { label: 'Documento',    color: '#e05c5c', bg: 'rgba(224,92,92,0.1)'   },
  annotation:   { label: 'Anotación',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
  chat:         { label: 'Chat',         color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  studio:       { label: 'Studio',       color: '#10b981', bg: 'rgba(16,185,129,0.1)'  },
  graph:        { label: 'Grafo',        color: '#a855f7', bg: 'rgba(168,85,247,0.1)'  },
};

const CATEGORY_LABEL: Record<string, string> = {
  resource:    'Recursos',
  interaction: 'Notas & Anotaciones',
  studio:      'Studio',
  graph:       'Grafo de conocimiento',
};

function TypeBadge({ type, folderColor }: { type: string; folderColor?: string }) {
  const meta = TYPE_META[type] ?? { label: type, color: 'var(--dome-text-muted)', bg: 'var(--dome-surface)' };
  const color = (type === 'folder' && folderColor) ? folderColor : meta.color;
  const bg = (type === 'folder' && folderColor) ? `${folderColor}22` : meta.bg;
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color, background: bg }}
    >
      {meta.label}
    </span>
  );
}

function highlight(text: string, query: string): string {
  if (!query.trim() || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '**$1**');
}

function SnippetText({ text, query }: { text: string; query: string }) {
  const parts = highlight(text, query).split(/\*\*(.+?)\*\*/g);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: 'rgba(124,111,205,0.2)', color: 'var(--dome-accent)', borderRadius: '2px' }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

/** Extract plain text from Tiptap JSON content or return as-is for plain strings */
function extractPlainText(content: string | null | undefined): string {
  if (!content) return '';
  // Try to parse as Tiptap JSON
  if (content.trimStart().startsWith('{') || content.trimStart().startsWith('[')) {
    try {
      const doc = JSON.parse(content);
      const parts: string[] = [];
      function walk(node: { type?: string; text?: string; content?: unknown[] }) {
        if (node.type === 'text' && node.text) parts.push(node.text);
        if (Array.isArray(node.content)) {
          for (const child of node.content) {
            if (child && typeof child === 'object') walk(child as { type?: string; text?: string; content?: unknown[] });
          }
        }
      }
      walk(doc);
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    } catch {
      // not JSON, fall through
    }
  }
  return content.replace(/\s+/g, ' ').trim();
}

function getSnippet(content: string | null | undefined, query: string, maxLen = 90): string {
  const text = extractPlainText(content);
  if (!text) return '';
  const lower = text.toLowerCase();
  const term = query.toLowerCase().split(' ')[0] ?? '';
  const idx = lower.indexOf(term);
  const start = Math.max(0, idx - 25);
  const raw = text.slice(start, start + maxLen).trim();
  return start > 0 ? `…${raw}` : raw;
}

interface InlineSearchProps {
  onResourceSelect?: (resource: { id: string; type: string; title: string }) => void;
  placeholder?: string;
}

export function InlineSearch({ onResourceSelect, placeholder }: InlineSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<Record<string, AdvancedResult[]>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ⌘K: AppShell dispara `dome:focus-inline-search` solo en el tab Inicio; Escape cierra
  useEffect(() => {
    const focusFromChrome = () => {
      inputRef.current?.focus();
      setIsFocused(true);
    };
    window.addEventListener('dome:focus-inline-search', focusFromChrome);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocused) {
        setQuery('');
        setGroups({});
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('dome:focus-inline-search', focusFromChrome);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused]);

  // Debounced multi-source search
  useEffect(() => {
    if (!query.trim()) { setGroups({}); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const allGroups: Record<string, AdvancedResult[]> = {};

        // 1. Unified search (resources + interactions + studio)
        if (window.electron?.db?.search?.unified) {
          const res = await window.electron.db.search.unified(query);
          if (res.success && res.data) {
            // Resources
            if (Array.isArray(res.data.resources) && res.data.resources.length > 0) {
              allGroups.resource = res.data.resources.slice(0, 6).map((r: {
                id: string; title?: string; type?: string; content?: string;
                updated_at?: number; metadata?: string | Record<string, unknown>;
              }) => {
                let folderColor: string | undefined;
                if (r.type === 'folder' && r.metadata) {
                  const meta = typeof r.metadata === 'string'
                    ? (() => { try { return JSON.parse(r.metadata); } catch { return {}; } })()
                    : r.metadata;
                  folderColor = meta?.color as string | undefined;
                }
                return {
                  id: r.id,
                  title: r.title || 'Sin título',
                  type: r.type || 'note',
                  category: 'resource' as const,
                  snippet: r.type === 'folder' ? undefined : getSnippet(r.content, query),
                  updated_at: r.updated_at,
                  folderColor,
                };
              });
            }
            // Interactions (notes, annotations, chats)
            if (Array.isArray(res.data.interactions) && res.data.interactions.length > 0) {
              allGroups.interaction = res.data.interactions.slice(0, 4).map((i: {
                id: string; type?: string; content?: string; created_at?: number; updated_at?: number;
                resource_title?: string; resource_type?: string; resource_id?: string;
              }) => ({
                id: i.resource_id || i.id,
                title: i.resource_title || 'Sin título',
                type: i.type || 'note',
                category: 'interaction' as const,
                snippet: getSnippet(i.content, query),
                updated_at: i.updated_at ?? i.created_at,
                parentTitle: i.resource_title,
                parentType: i.resource_type,
              }));
            }
            // Studio outputs
            if (Array.isArray(res.data.studioOutputs) && res.data.studioOutputs.length > 0) {
              allGroups.studio = res.data.studioOutputs.slice(0, 3).map((s: {
                id: string; title?: string; content?: string; updated_at?: number;
              }) => ({
                id: s.id,
                title: s.title || 'Studio output',
                type: 'studio',
                category: 'studio' as const,
                snippet: getSnippet(s.content, query),
                updated_at: s.updated_at,
              }));
            }
          }
        }

        // 2. Graph nodes
        if (window.electron?.invoke) {
          try {
            const graphRes = await window.electron.invoke('db:graph:searchNodes', query);
            if (graphRes?.success && Array.isArray(graphRes.data) && graphRes.data.length > 0) {
              allGroups.graph = graphRes.data.slice(0, 3).map((n: {
                id: string; label?: string; type?: string; updated_at?: number;
              }) => ({
                id: n.id,
                title: n.label || 'Nodo',
                type: 'graph',
                category: 'graph' as const,
                updated_at: n.updated_at,
              }));
            }
          } catch {
            // graph search optional
          }
        }

        setGroups(allGroups);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const totalResults = Object.values(groups).reduce((s, g) => s + g.length, 0);
  const showDropdown = isFocused && query.trim().length > 0;

  const handleSelect = (result: AdvancedResult) => {
    onResourceSelect?.({ id: result.id, type: result.type, title: result.title });
    setQuery('');
    setGroups({});
    setIsFocused(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* ── Input ─── */}
      <div
        className="flex w-full items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200"
        style={{
          background: 'var(--dome-surface)',
          borderColor: isFocused ? 'var(--dome-accent)' : 'var(--dome-border)',
          boxShadow: isFocused ? '0 0 0 3px rgba(124,111,205,0.15)' : 'none',
        }}
      >
        <Search
          className="h-4 w-4 shrink-0"
          strokeWidth={1.5}
          style={{ color: isFocused ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder ?? t('dashboard.search_placeholder', 'Buscar recursos, notas, PDFs, chats…')}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--dome-text)' }}
          autoComplete="off"
        />
        {isSearching ? (
          <div
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2"
            style={{ borderColor: 'var(--dome-accent)', borderTopColor: 'transparent' }}
          />
        ) : query ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setGroups({}); inputRef.current?.focus(); }}
            className="rounded p-0.5 hover:bg-[var(--dome-bg)]"
          >
            <X className="h-4 w-4" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
          </button>
        ) : (
          <kbd
            className="hidden sm:flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
          >
            <span>⌘</span><span>K</span>
          </kbd>
        )}
      </div>

      {/* ── Dropdown ─── */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border shadow-xl"
          style={{ background: 'var(--dome-bg)', borderColor: 'var(--dome-border)' }}
        >
          {!isSearching && totalResults === 0 ? (
            <div className="px-4 py-8 text-center">
              <Search className="mx-auto mb-2 h-7 w-7" strokeWidth={1.5} style={{ color: 'var(--dome-text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                Sin resultados para <strong>«{query}»</strong>
              </p>
            </div>
          ) : isSearching && totalResults === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>Buscando…</p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {(['resource', 'interaction', 'studio', 'graph'] as const).map((cat) => {
                const items = groups[cat];
                if (!items?.length) return null;
                return (
                  <div key={cat}>
                    {/* Section header */}
                    <div
                      className="sticky top-0 z-10 px-3 py-1.5"
                      style={{ background: 'var(--dome-bg)', borderBottom: '1px solid var(--dome-border)' }}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--dome-text-muted)' }}>
                        {CATEGORY_LABEL[cat]}
                      </span>
                    </div>
                    {/* Items */}
                    <div className="p-1.5 flex flex-col gap-0.5">
                      {items.map((result) => (
                        <button
                          key={`${cat}-${result.id}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleSelect(result); }}
                          className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--dome-surface)]"
                        >
                          {/* Icon */}
                          {(() => {
                            const isFolder = result.type === 'folder';
                            const iconColor = isFolder && result.folderColor
                              ? result.folderColor
                              : (TYPE_META[result.type] ?? DEFAULT_TYPE_META).color;
                            const iconBg = isFolder && result.folderColor
                              ? `${result.folderColor}22`
                              : (TYPE_META[result.type] ?? DEFAULT_TYPE_META).bg;
                            return (
                              <span
                                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                                style={{ background: iconBg, color: iconColor }}
                              >
                                {TYPE_ICONS[result.type] ?? <File className="h-4 w-4 shrink-0" strokeWidth={1.5} />}
                              </span>
                            );
                          })()}

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                                {result.title}
                              </span>
                              <TypeBadge type={result.type} folderColor={result.folderColor} />
                            </div>
                            {result.snippet && (
                              <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                                <SnippetText text={result.snippet} query={query} />
                              </p>
                            )}
                            {result.parentTitle && result.category === 'interaction' && (
                              <p className="mt-0.5 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                                En: {result.parentTitle}
                              </p>
                            )}
                          </div>

                          {/* Timestamp */}
                          {result.updated_at && (
                            <span className="shrink-0 text-xs tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
                              {formatDistanceToNow(result.updated_at * 1000)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SimpleSearch;
