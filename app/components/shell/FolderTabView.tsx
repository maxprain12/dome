import { useState, useEffect } from 'react';
import { Folder, FileText, BookOpen, Globe, File, Loader2 } from 'lucide-react';
import { useTabStore } from '@/lib/store/useTabStore';

interface FolderTabViewProps {
  folderId: string;
  folderTitle: string;
}

function ResourceIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 shrink-0';
  switch (type) {
    case 'note': return <FileText className={cls} />;
    case 'notebook': return <BookOpen className={cls} />;
    case 'url': return <Globe className={cls} />;
    default: return <File className={cls} />;
  }
}

export default function FolderTabView({ folderId, folderTitle }: FolderTabViewProps) {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!window.electron?.db?.resources) { setLoading(false); return; }
      try {
        const result = await window.electron.db.resources.getAll(1000);
        if (result?.success && result.data) {
          setResources(
            (result.data as any[]).filter(
              (r: any) => r.folder_id === folderId && r.type !== 'folder'
            )
          );
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [folderId]);

  if (loading) return (
    <div className="flex items-center justify-center h-full" style={{ color: 'var(--secondary-text)' }}>
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-auto p-6" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center gap-3 mb-6">
        <Folder className="w-6 h-6" style={{ color: 'var(--accent)' }} />
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--primary-text)' }}>{folderTitle}</h1>
          <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>{resources.length} items</p>
        </div>
      </div>
      {resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2" style={{ color: 'var(--secondary-text)' }}>
          <Folder className="w-10 h-10 opacity-30" />
          <p className="text-sm">Esta carpeta está vacía</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {resources.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => useTabStore.getState().openResourceTab(r.id, r.type || 'note', r.title || 'Sin título')}
              className="flex flex-col gap-2 p-4 rounded-xl text-left transition-colors"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
            >
              <ResourceIcon type={r.type} />
              <span className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>{r.title || 'Sin título'}</span>
              <span className="text-xs capitalize" style={{ color: 'var(--secondary-text)' }}>{r.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
