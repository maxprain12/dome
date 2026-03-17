'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Cloud, HardDrive, File, Folder, ChevronRight, Search, X,
  Download, RefreshCw, AlertCircle,
} from 'lucide-react';
import { showToast } from '@/lib/store/useToastStore';

interface CloudAccount {
  provider: 'google' | 'onedrive';
  accountId: string;
  email: string;
  connected: boolean;
}

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

interface BreadcrumbEntry {
  id: string | null;
  name: string;
}

interface CloudFilePickerProps {
  projectId?: string;
  folderId?: string | null;
  onClose: () => void;
  onImported?: (resource: unknown) => void;
}

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google Drive',
  onedrive: 'OneDrive',
};

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CloudFilePicker({ projectId, folderId, onClose, onImported }: CloudFilePickerProps) {
  const [accounts, setAccounts] = useState<CloudAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<CloudAccount | null>(null);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([{ id: null, name: 'Home' }]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load accounts on mount
  useEffect(() => {
    if (!window.electron?.cloud) return;
    window.electron.cloud.getAccounts().then((result: { success: boolean; accounts?: CloudAccount[] }) => {
      if (result.success && result.accounts) {
        setAccounts(result.accounts);
        if (result.accounts.length > 0) setSelectedAccount(result.accounts[0] ?? null);
      }
    });
  }, []);

  const currentFolderId = breadcrumbs[breadcrumbs.length - 1]?.id ?? null;

  const loadFiles = useCallback(async (account: CloudAccount, fid: string | null, q: string) => {
    if (!window.electron?.cloud) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electron.cloud.listFiles({
        accountId: account.accountId,
        folderId: q ? undefined : fid,
        query: q || undefined,
      });
      if (result.success) {
        setFiles(result.files ?? []);
      } else {
        setError(result.error || 'Failed to list files');
        setFiles([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when account or folder changes
  useEffect(() => {
    if (selectedAccount) {
      loadFiles(selectedAccount, currentFolderId, query);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount, currentFolderId]);

  // Debounce search
  useEffect(() => {
    if (!selectedAccount) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      loadFiles(selectedAccount, currentFolderId, query);
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const openFolder = (file: CloudFile) => {
    setBreadcrumbs((prev) => [...prev, { id: file.id, name: file.name }]);
    setSelected(new Set());
    setQuery('');
  };

  const navigateTo = (idx: number) => {
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    setSelected(new Set());
    setQuery('');
  };

  const toggleSelect = (fileId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedAccount || selected.size === 0) return;
    setImporting(true);
    let successCount = 0;
    let lastResource: unknown = null;

    for (const fileId of selected) {
      const file = files.find((f) => f.id === fileId);
      if (!file || file.isFolder) continue;
      try {
        const result = await window.electron.cloud.importFile({
          accountId: selectedAccount.accountId,
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          projectId,
          folderId,
        });
        if (result.success) {
          successCount++;
          lastResource = result.resource;
        } else if (result.error === 'duplicate') {
          showToast('info', `"${file.name}" already exists in your library`);
        } else {
          showToast('error', `Failed to import "${file.name}": ${result.error}`);
        }
      } catch (err) {
        showToast('error', `Error importing "${file.name}"`);
      }
    }

    setImporting(false);
    if (successCount > 0) {
      showToast('success', `Imported ${successCount} file${successCount > 1 ? 's' : ''}`);
      if (lastResource) onImported?.(lastResource);
      onClose();
    }
  };

  const selectedFiles = files.filter((f) => selected.has(f.id) && !f.isFolder);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 760,
          maxWidth: '95vw',
          height: 560,
          maxHeight: '90vh',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary-text)', margin: 0 }}>
            Import from Cloud
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tertiary-text)', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div
            style={{
              width: 200,
              borderRight: '1px solid var(--border)',
              padding: '12px 8px',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--tertiary-text)', marginBottom: 8, padding: '0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Accounts
            </div>
            {accounts.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--tertiary-text)', padding: '0 8px' }}>
                No accounts connected.
              </div>
            ) : (
              accounts.map((account) => (
                <button
                  key={account.accountId}
                  onClick={() => { setSelectedAccount(account); setBreadcrumbs([{ id: null, name: 'Home' }]); setQuery(''); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: selectedAccount?.accountId === account.accountId ? 'var(--bg-secondary)' : 'transparent',
                    color: 'var(--primary-text)',
                    fontSize: 12,
                    fontWeight: 500,
                    textAlign: 'left',
                  }}
                >
                  {account.provider === 'google' ? <Cloud size={14} style={{ color: '#4285f4', flexShrink: 0 }} /> : <HardDrive size={14} style={{ color: '#0078d4', flexShrink: 0 }} />}
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontWeight: 600 }}>{PROVIDER_LABEL[account.provider]}</div>
                    <div style={{ color: 'var(--tertiary-text)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Main panel */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Breadcrumbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, overflow: 'hidden' }}>
                {breadcrumbs.map((bc, idx) => (
                  <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {idx > 0 && <ChevronRight size={12} style={{ color: 'var(--tertiary-text)' }} />}
                    <button
                      onClick={() => navigateTo(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 12,
                        color: idx === breadcrumbs.length - 1 ? 'var(--primary-text)' : 'var(--accent)',
                        fontWeight: idx === breadcrumbs.length - 1 ? 600 : 400,
                        padding: 0,
                      }}
                    >
                      {bc.name}
                    </button>
                  </span>
                ))}
              </div>
              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--tertiary-text)' }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search files…"
                  style={{
                    paddingLeft: 26,
                    paddingRight: 8,
                    paddingTop: 6,
                    paddingBottom: 6,
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--primary-text)',
                    width: 160,
                  }}
                />
              </div>
            </div>

            {/* File list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {!selectedAccount ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tertiary-text)', fontSize: 13 }}>
                  Select an account from the sidebar
                </div>
              ) : loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--tertiary-text)', fontSize: 13 }}>
                  <RefreshCw size={14} className="animate-spin" /> Loading…
                </div>
              ) : error ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8, color: 'var(--secondary-text)', fontSize: 13 }}>
                  <AlertCircle size={20} style={{ color: '#ef4444' }} />
                  {error}
                </div>
              ) : files.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tertiary-text)', fontSize: 13 }}>
                  No files found
                </div>
              ) : (
                files.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => file.isFolder ? openFolder(file) : toggleSelect(file.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 16px',
                      cursor: 'pointer',
                      background: selected.has(file.id) ? 'var(--bg-secondary)' : 'transparent',
                      borderLeft: selected.has(file.id) ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected.has(file.id)) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!selected.has(file.id)) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                    }}
                  >
                    {file.isFolder
                      ? <Folder size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                      : <File size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: 13, color: 'var(--primary-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </div>
                      {file.modifiedAt && (
                        <div style={{ fontSize: 11, color: 'var(--tertiary-text)' }}>
                          {new Date(file.modifiedAt).toLocaleDateString()}
                          {file.size ? ` · ${formatSize(file.size)}` : ''}
                        </div>
                      )}
                    </div>
                    {file.isFolder && <ChevronRight size={14} style={{ color: 'var(--tertiary-text)', flexShrink: 0 }} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--secondary-text)' }}>
            {selectedFiles.length > 0
              ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`
              : 'Click files to select them'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--secondary-text)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={selectedFiles.length === 0 || importing}
              style={{
                padding: '8px 16px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 6,
                cursor: selectedFiles.length === 0 || importing ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 500,
                color: 'white',
                opacity: selectedFiles.length === 0 || importing ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {importing
                ? <><RefreshCw size={13} className="animate-spin" /> Importing…</>
                : <><Download size={13} /> Import{selectedFiles.length > 1 ? ` (${selectedFiles.length})` : ''}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
