import { useState, useEffect, useCallback } from 'react';
import {
  Cloud, Folder, File, ChevronRight, ChevronLeft,
  Search, X, Download, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import DomeButton from '@/components/ui/DomeButton';

interface CloudFile {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
  isFolder: boolean;
  provider: string;
  accountId: string;
}

interface CloudAccount {
  provider: 'google';
  accountId: string;
  email: string;
  connected: boolean;
}

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface Props {
  onClose: () => void;
  projectId?: string | null;
  folderId?: string | null;
}

const PROVIDER_ICON = {
  google: <Cloud className="w-4 h-4" />,
};

const IMPORTABLE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'text/plain',
  'text/markdown',
  // Google Docs native types (exported as PDF)
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.spreadsheet',
]);

function isImportable(file: CloudFile) {
  if (file.isFolder) return false;
  if (!file.mimeType) return false;
  return IMPORTABLE_TYPES.has(file.mimeType);
}

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CloudFilePicker({ onClose, projectId, folderId }: Props) {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CloudAccount | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Mi unidad' }]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load accounts on mount
  useEffect(() => {
    window.electron?.cloud?.getAccounts().then((r) => {
      if (r.success && r.accounts) {
        setAccounts(r.accounts);
        if (r.accounts.length === 1) setSelectedAccount(r.accounts[0]);
      }
    });
  }, []);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id ?? null;

  const loadFiles = useCallback(async (account: CloudAccount, fId: string | null, q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await window.electron.cloud.listFiles({
        accountId: account.accountId,
        folderId: fId,
        query: q || undefined,
      });
      if (r.success) {
        const sorted = (r.files ?? []).sort((a, b) => {
          if (a.isFolder && !b.isFolder) return -1;
          if (!a.isFolder && b.isFolder) return 1;
          return a.name.localeCompare(b.name);
        });
        setFiles(sorted);
      } else {
        setError(r.error ?? 'Error al cargar archivos');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load files when account or folder changes
  useEffect(() => {
    if (!selectedAccount) return;
    setSearch('');
    loadFiles(selectedAccount, currentFolderId);
  }, [selectedAccount, currentFolderId, loadFiles]);

  const handleSearch = useCallback(() => {
    if (!selectedAccount || !search.trim()) return;
    loadFiles(selectedAccount, null, search.trim());
  }, [selectedAccount, search, loadFiles]);

  const handleFolderOpen = (file: CloudFile) => {
    setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
  };

  const handleBreadcrumb = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleBack = () => {
    if (breadcrumbs.length > 1) setBreadcrumbs((prev) => prev.slice(0, -1));
  };

  const handleImport = async (file: CloudFile) => {
    if (!selectedAccount) return;
    setImporting(file.id);
    try {
      const r = await window.electron.cloud.importFile({
        accountId: selectedAccount.accountId,
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        projectId: projectId ?? undefined,
        folderId: folderId ?? undefined,
      });
      if (r.success) {
        setImportedIds((prev) => new Set([...prev, file.id]));
      } else if (r.error === 'duplicate') {
        setImportedIds((prev) => new Set([...prev, file.id]));
      } else {
        setError(r.error ?? 'Error al importar');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al importar');
    } finally {
      setImporting(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: 680, height: 520,
          backgroundColor: 'var(--bg)', border: '1px solid var(--border)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm" style={{ color: 'var(--primary-text)' }}>
              Importar desde Cloud
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-4 h-4" style={{ color: 'var(--tertiary-text)' }} />
          </button>
        </div>

        {/* Account selector (if multiple) */}
        {accounts.length > 1 && (
          <div className="flex gap-2 px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            {accounts.map((acc) => (
              <button
                key={acc.accountId}
                onClick={() => { setSelectedAccount(acc); setBreadcrumbs([{ id: null, name: 'Mi unidad' }]); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: selectedAccount?.accountId === acc.accountId ? 'var(--accent)' : 'var(--bg-secondary)',
                  color: selectedAccount?.accountId === acc.accountId ? 'white' : 'var(--secondary-text)',
                  border: '1px solid var(--border)',
                }}
              >
                {PROVIDER_ICON[acc.provider]}
                {acc.email}
              </button>
            ))}
          </div>
        )}

        {/* No accounts */}
        {accounts.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ color: 'var(--tertiary-text)' }}>
            <Cloud className="w-10 h-10 opacity-30" />
            <p className="text-sm">No hay cuentas cloud conectadas.</p>
            <p className="text-xs">Conecta Google Drive en Settings → Cloud.</p>
          </div>
        )}

        {/* File browser */}
        {selectedAccount && (
          <>
            {/* Toolbar: breadcrumbs + search */}
            <div className="flex items-center gap-2 px-5 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={handleBack}
                disabled={breadcrumbs.length <= 1}
                className="p-1.5 rounded-lg disabled:opacity-30 transition-opacity hover:opacity-70"
              >
                <ChevronLeft className="w-3.5 h-3.5" style={{ color: 'var(--secondary-text)' }} />
              </button>

              {/* Breadcrumb trail */}
              <div className="flex items-center gap-1 flex-1 overflow-hidden">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1 shrink-0">
                    {i > 0 && <ChevronRight className="w-3 h-3 opacity-40" style={{ color: 'var(--tertiary-text)' }} />}
                    <button
                      onClick={() => handleBreadcrumb(i)}
                      className="text-xs hover:opacity-70 transition-opacity truncate max-w-[120px]"
                      style={{ color: i === breadcrumbs.length - 1 ? 'var(--primary-text)' : 'var(--accent)', fontWeight: i === breadcrumbs.length - 1 ? 600 : 400 }}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Search */}
              <div className="flex items-center gap-1" style={{ backgroundColor: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)', padding: '4px 10px' }}>
                <Search className="w-3 h-3 shrink-0" style={{ color: 'var(--tertiary-text)' }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar archivos..."
                  className="text-xs bg-transparent outline-none w-36"
                  style={{ color: 'var(--primary-text)' }}
                />
                {search && (
                  <button onClick={() => { setSearch(''); if (selectedAccount) loadFiles(selectedAccount, currentFolderId); }}>
                    <X className="w-3 h-3" style={{ color: 'var(--tertiary-text)' }} />
                  </button>
                )}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mx-5 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: 'var(--dome-error)' }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* File list */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {loading ? (
                <div className="flex items-center justify-center h-full gap-2" style={{ color: 'var(--tertiary-text)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Cargando...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--tertiary-text)' }}>
                  <Folder className="w-8 h-8 opacity-30" />
                  <span className="text-xs">Carpeta vacía</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {files.map((file) => {
                    const canImport = isImportable(file);
                    const alreadyImported = importedIds.has(file.id);
                    const isImportingThis = importing === file.id;

                    return (
                      <div
                        key={file.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl group transition-colors cursor-pointer"
                        style={{ ':hover': {} } as React.CSSProperties}
                        onClick={() => file.isFolder && handleFolderOpen(file)}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Icon */}
                        <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg" style={{ backgroundColor: file.isFolder ? 'var(--bg-tertiary)' : 'var(--bg-secondary)' }}>
                          {file.isFolder
                            ? <Folder className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                            : <File className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
                          }
                        </div>

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--primary-text)' }}>{file.name}</p>
                          {!file.isFolder && (
                            <p className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                              {formatSize(file.size)}
                              {!canImport && ' · tipo no soportado'}
                            </p>
                          )}
                        </div>

                        {/* Action */}
                        <div className="shrink-0">
                          {file.isFolder ? (
                            <ChevronRight className="w-3.5 h-3.5 opacity-40" style={{ color: 'var(--tertiary-text)' }} />
                          ) : alreadyImported ? (
                            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                          ) : canImport ? (
                            <DomeButton
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImport(file);
                              }}
                              disabled={!!importing}
                              loading={isImportingThis}
                              leftIcon={!isImportingThis ? <Download className="w-3 h-3" aria-hidden /> : undefined}
                            >
                              {isImportingThis ? 'Importando...' : 'Importar'}
                            </DomeButton>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--tertiary-text)' }}>
                {selectedAccount.email} · {files.filter((f) => !f.isFolder).length} archivos
              </span>
              <DomeButton type="button" variant="secondary" size="sm" onClick={onClose}>
                Cerrar
              </DomeButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
