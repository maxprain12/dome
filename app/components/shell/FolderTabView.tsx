import { useMemo, useCallback, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  FolderOpen, Folder, FileText, BookOpen, Globe, File as FileIcon,
  Image, Music, Video, Plus, Home, ChevronRight, FileQuestion,
  MoreVertical, Trash2, Pencil, X, Check, Presentation,
} from 'lucide-react';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore } from '@/lib/store/useTabStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderTabViewProps {
  folderId: string;
  folderTitle: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFolderColor(folder: Resource): string {
  const meta = folder.metadata as { color?: string } | undefined;
  return meta?.color ?? 'var(--dome-text-muted)';
}

function ResourceTypeIcon({ type, className }: { type: string; className?: string }) {
  const cls = className ?? 'w-4 h-4 shrink-0';
  switch (type) {
    case 'note':     return <FileText className={cls} />;
    case 'notebook': return <BookOpen className={cls} />;
    case 'url':      return <Globe className={cls} />;
    case 'image':    return <Image className={cls} />;
    case 'audio':    return <Music className={cls} />;
    case 'video':    return <Video className={cls} />;
    case 'pdf':      return <FileIcon className={cls} />;
    case 'ppt':      return <Presentation className={cls} />;
    default:         return <FileQuestion className={cls} />;
  }
}

const TYPE_LABELS: Record<string, string> = {
  note: 'Nota', notebook: 'Cuaderno', url: 'URL',
  pdf: 'PDF', image: 'Imagen', video: 'Video',
  audio: 'Audio', document: 'Documento', ppt: 'Presentación',
};

const TYPE_COLORS: Record<string, string> = {
  note: '#7b76d0', notebook: '#3b82f6', url: '#10b981',
  pdf: '#ef4444', image: '#f59e0b', video: '#ec4899', audio: '#8b5cf6', ppt: '#d47b3f',
};

// ─── SubfolderCard ────────────────────────────────────────────────────────────

function SubfolderCard({ folder, onClick }: { folder: Resource; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const color = getFolderColor(folder);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-2.5 p-3 rounded-xl text-left transition-all"
      style={{
        background: hovered ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
        border: `1px solid ${hovered ? color : 'var(--dome-border)'}`,
      }}
    >
      <Folder className="w-4 h-4 shrink-0" style={{ color }} />
      <span className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
        {folder.title}
      </span>
    </button>
  );
}

// ─── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({
  file,
  isLast,
  onOpen,
  onDelete,
  onRename,
}: {
  file: Resource;
  isLast: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(file.title ?? '');

  const typeColor = TYPE_COLORS[file.type] ?? 'var(--dome-text-muted)';
  const typeLabel = TYPE_LABELS[file.type] ?? file.type;
  const timeAgo = file.updated_at
    ? formatDistanceToNow(new Date(file.updated_at), { addSuffix: true })
    : null;

  const commitRename = () => {
    if (renameValue.trim() && renameValue.trim() !== file.title) {
      onRename(renameValue.trim());
    }
    setRenaming(false);
  };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 transition-colors relative group"
      style={{
        borderBottom: isLast ? undefined : '1px solid var(--dome-border)',
        background: hovered ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
    >
      {/* Color dot */}
      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: typeColor }} />

      {/* Type icon */}
      <div style={{ color: typeColor }}>
        <ResourceTypeIcon type={file.type} />
      </div>

      {/* Title / rename input */}
      {renaming ? (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            className="flex-1 text-[13px] font-medium rounded px-2 py-0.5 outline-none"
            style={{
              background: 'var(--dome-bg)',
              border: '1px solid var(--dome-accent)',
              color: 'var(--dome-text)',
            }}
          />
          <button type="button" onClick={commitRename} style={{ color: 'var(--dome-accent)' }}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => setRenaming(false)} style={{ color: 'var(--dome-text-muted)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 text-left text-[13px] font-medium truncate hover:underline underline-offset-2 min-w-0"
          style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {file.title || 'Sin título'}
        </button>
      )}

      {/* Type badge */}
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-md shrink-0"
        style={{ background: `${typeColor}18`, color: typeColor }}
      >
        {typeLabel}
      </span>

      {/* Date */}
      {timeAgo && (
        <span className="text-[11px] shrink-0 tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
          {timeAgo}
        </span>
      )}

      {/* Actions menu */}
      {hovered && !renaming && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            className="flex items-center justify-center rounded transition-colors p-0.5"
            style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 z-50 rounded-lg shadow-lg py-1 min-w-[130px]"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)', top: '100%', marginTop: 4 }}
            >
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setRenaming(true); setRenameValue(file.title ?? ''); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: 'var(--dome-text)', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Pencil className="w-3 h-3" /> Renombrar
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors text-left"
                style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
              >
                <Trash2 className="w-3 h-3" /> Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NewFolderInline ──────────────────────────────────────────────────────────

function NewFolderInline({ onConfirm, onCancel }: { onConfirm: (name: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl" style={{ border: '1px dashed var(--dome-border)', background: 'var(--dome-surface)' }}>
      <Folder className="w-4 h-4 shrink-0" style={{ color: 'var(--dome-text-muted)' }} />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nombre de la carpeta"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onConfirm(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        className="flex-1 text-sm outline-none bg-transparent"
        style={{ color: 'var(--dome-text)' }}
      />
      <button type="button" onClick={() => value.trim() && onConfirm(value.trim())} style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <Check className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={onCancel} style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── FolderTabView ────────────────────────────────────────────────────────────

export default function FolderTabView({ folderId, folderTitle }: FolderTabViewProps) {
  const [creatingFolder, setCreatingFolder] = useState(false);

  const {
    folders: subfolders,
    nonFolderResources: files,
    isLoading,
    createResource,
    deleteResource,
    updateResource,
    getFolderById,
    getBreadcrumbPath,
  } = useResources({ folderId, sortBy: 'updated_at', sortOrder: 'desc' });

  const { openResourceTab, openFolderTab, activateTab } = useTabStore();

  const currentFolder = getFolderById(folderId);
  const breadcrumb = useMemo(
    () => getBreadcrumbPath(folderId).filter((f) => f.id !== folderId),
    [folderId, getBreadcrumbPath],
  );
  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--dome-accent)';

  const handleCreateNote = useCallback(async () => {
    const resource = await createResource({
      type: 'note',
      title: 'Untitled Note',
      project_id: 'default',
      content: '',
      folder_id: folderId,
    });
    if (resource?.id) {
      openResourceTab(resource.id, 'note', resource.title ?? 'Untitled Note');
    }
  }, [createResource, folderId, openResourceTab]);

  const handleCreateFolder = useCallback(async (name: string) => {
    await createResource({
      type: 'folder',
      title: name,
      project_id: 'default',
      content: '',
      folder_id: folderId,
    });
    setCreatingFolder(false);
  }, [createResource, folderId]);

  const handleDeleteFile = useCallback(async (id: string) => {
    if (!window.confirm('¿Eliminar este archivo?')) return;
    await deleteResource(id);
  }, [deleteResource]);

  const handleRenameFile = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
  }, [updateResource]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <div
          className="w-5 h-5 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--dome-border)', borderTopColor: 'var(--dome-accent)' }}
        />
      </div>
    );
  }

  const isEmpty = subfolders.length === 0 && files.length === 0 && !creatingFolder;

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
      <div className="max-w-4xl mx-auto w-full px-8 py-6 flex flex-col gap-6">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
          <button
            type="button"
            onClick={() => activateTab('home')}
            className="flex items-center gap-1 hover:text-[var(--dome-text)] transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <Home className="w-3 h-3" />
            <span>Inicio</span>
          </button>
          {breadcrumb.map((folder) => (
            <>
              <ChevronRight key={`sep-${folder.id}`} className="w-3 h-3 shrink-0" />
              <button
                key={folder.id}
                type="button"
                onClick={() => openFolderTab(folder.id, folder.title)}
                className="hover:text-[var(--dome-text)] transition-colors truncate"
                style={{ maxWidth: 120, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                title={folder.title}
              >
                {folder.title}
              </button>
            </>
          ))}
          {breadcrumb.length > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
          <span style={{ color: 'var(--dome-text)' }}>
            {currentFolder?.title ?? folderTitle}
          </span>
        </nav>

        {/* Folder header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${folderColor}20` }}
            >
              <FolderOpen className="w-6 h-6" style={{ color: folderColor }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--dome-text)' }}>
                {currentFolder?.title ?? folderTitle}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                {subfolders.length + files.length} elemento{subfolders.length + files.length !== 1 ? 's' : ''}
                {subfolders.length > 0 && ` · ${subfolders.length} carpeta${subfolders.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: 'var(--dome-surface)',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-text)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border)'; }}
            >
              <Plus className="w-3.5 h-3.5" />
              Carpeta
            </button>
            <button
              type="button"
              onClick={handleCreateNote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{ background: 'var(--dome-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva nota
            </button>
          </div>
        </div>

        {/* Empty state */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--dome-surface)' }}
            >
              <FolderOpen className="w-8 h-8" style={{ color: 'var(--dome-text-muted)', opacity: 0.4 }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>Carpeta vacía</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>
                Crea una nota o añade archivos aquí
              </p>
            </div>
            <button
              type="button"
              onClick={handleCreateNote}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium mt-2"
              style={{ background: 'var(--dome-accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Plus className="w-4 h-4" />
              Nueva nota
            </button>
          </div>
        ) : (
          <>
            {/* Subfolders */}
            {(subfolders.length > 0 || creatingFolder) && (
              <section>
                <h2
                  className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  Carpetas
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {subfolders.map((folder) => (
                    <SubfolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={() => openFolderTab(folder.id, folder.title)}
                    />
                  ))}
                  {creatingFolder && (
                    <NewFolderInline
                      onConfirm={handleCreateFolder}
                      onCancel={() => setCreatingFolder(false)}
                    />
                  )}
                </div>
              </section>
            )}

            {/* Files */}
            {files.length > 0 && (
              <section>
                <h2
                  className="text-[11px] font-semibold uppercase tracking-widest mb-3"
                  style={{ color: 'var(--dome-text-muted)' }}
                >
                  Archivos
                </h2>
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: 'var(--dome-border)' }}
                >
                  {files.map((file, idx) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      isLast={idx === files.length - 1}
                      onOpen={() => openResourceTab(file.id, file.type ?? 'note', file.title ?? 'Sin título')}
                      onDelete={() => handleDeleteFile(file.id)}
                      onRename={(newTitle) => handleRenameFile(file.id, newTitle)}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* Show new folder inline even in empty state when triggered */}
        {isEmpty && creatingFolder && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <NewFolderInline
              onConfirm={handleCreateFolder}
              onCancel={() => setCreatingFolder(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
