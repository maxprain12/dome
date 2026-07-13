import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon, CheckmarkCircle02Icon, CloudIcon, Download04Icon, File01Icon, Folder01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface CloudFile {
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
  google: <HugeiconsIcon icon={CloudIcon} />,
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

export function isImportable(file: CloudFile) {
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
  const { t } = useTranslation();
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[min(80vh,560px)] max-w-3xl flex-col overflow-hidden">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><HugeiconsIcon icon={CloudIcon} />{t('cloud.import_title', 'Import from Cloud')}</DialogTitle><DialogDescription>{t('cloud.import_description', 'Browse a connected account and import compatible documents into Dome.')}</DialogDescription></DialogHeader>

        {/* Account selector (if multiple) */}
        {accounts.length > 1 && (
          <Tabs value={selectedAccount?.accountId ?? ''} onValueChange={(accountId) => { const account = accounts.find((entry) => entry.accountId === accountId); if (account) { setSelectedAccount(account); setBreadcrumbs([{ id: null, name: t('cloud.my_drive', 'My drive') }]); } }}><TabsList>{accounts.map((account) => <TabsTrigger value={account.accountId} key={account.accountId}>{PROVIDER_ICON[account.provider]}{account.email}</TabsTrigger>)}</TabsList></Tabs>
        )}

        {/* No accounts */}
        {accounts.length === 0 && (
          <Empty className="flex-1"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={CloudIcon} /></EmptyMedia><EmptyTitle>No hay cuentas cloud conectadas</EmptyTitle><EmptyDescription>Conecta Google Drive en Settings → Cloud.</EmptyDescription></EmptyHeader></Empty>
        )}

        {/* File browser */}
        {selectedAccount && (
          <>
            {/* Toolbar: breadcrumbs + search */}
            <div className="flex items-center gap-2 border-b px-5 py-2.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleBack}
                disabled={breadcrumbs.length <= 1}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
              </Button>

              {/* Breadcrumb trail */}
              <Breadcrumb className="min-w-0 flex-1 overflow-hidden"><BreadcrumbList>
                {breadcrumbs.map((crumb, i) => (
                  <span key={`trail:${breadcrumbs.slice(0, i + 1).map((c) => String(c.id ?? 'root')).join('/')}`} className="contents">
                    {i > 0 ? <BreadcrumbSeparator /> : null}
                    <BreadcrumbItem>{i === breadcrumbs.length - 1 ? <BreadcrumbPage className="max-w-32 truncate">{crumb.name}</BreadcrumbPage> : <Button type="button" variant="link" size="xs" className="max-w-32 truncate p-0" onClick={() => handleBreadcrumb(i)}>{crumb.name}</Button>}</BreadcrumbItem>
                  </span>
                ))}
              </BreadcrumbList></Breadcrumb>

              {/* Search */}
              <InputGroup className="w-52">
                <InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Buscar archivos..."
                  aria-label="Buscar archivos"
                />
                {search && (
                  <InputGroupButton size="icon-xs" onClick={() => { setSearch(''); if (selectedAccount) loadFiles(selectedAccount, currentFolderId); }}><HugeiconsIcon icon={Cancel01Icon} /></InputGroupButton>
                )}
              </InputGroup>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive"><HugeiconsIcon icon={AlertCircleIcon} /><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" variant="outline" size="sm" onClick={() => selectedAccount && void loadFiles(selectedAccount, currentFolderId)}>{t('common.retry', 'Retry')}</Button></AlertDescription></Alert>
            )}
            {importing ? <Progress value={null} aria-label={t('cloud.importing', 'Importing file')} /> : null}

            {/* File list */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
                  <Spinner />
                  <span className="text-xs">Cargando...</span>
                </div>
              ) : files.length === 0 ? (
                <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={Folder01Icon} /></EmptyMedia><EmptyTitle>Carpeta vacía</EmptyTitle></EmptyHeader></Empty>
              ) : (
                <ItemGroup className="gap-0.5">
                  {files.map((file) => {
                    const canImport = isImportable(file);
                    const alreadyImported = importedIds.has(file.id);
                    const isImportingThis = importing === file.id;

                    const folderRowHandlers = file.isFolder
                      ? {
                          role: 'button' as const,
                          tabIndex: 0 as const,
                          onClick: () => handleFolderOpen(file),
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleFolderOpen(file);
                            }
                          },
                        }
                      : {};

                    return (
                      <Item
                        key={file.id}
                        size="xs"
                        variant="default"
                        className={file.isFolder ? 'cursor-pointer' : undefined}
                        {...folderRowHandlers}
                      >
                        {/* Icon */}
                        <ItemMedia variant="icon">
                          {file.isFolder
                            ? <HugeiconsIcon icon={Folder01Icon} />
                            : <HugeiconsIcon icon={File01Icon} />
                          }
                        </ItemMedia>

                        {/* Name + meta */}
                        <ItemContent>
                          <ItemTitle>{file.name}</ItemTitle>
                          {!file.isFolder && (
                            <ItemDescription>
                              {formatSize(file.size)}
                              {!canImport && ' · tipo no soportado'}
                            </ItemDescription>
                          )}
                        </ItemContent>

                        {/* Action */}
                        <ItemActions>
                          {file.isFolder ? (
                            <HugeiconsIcon icon={ArrowRight01Icon} />
                          ) : alreadyImported ? (
                            <Badge variant="secondary"><HugeiconsIcon icon={CheckmarkCircle02Icon} />{t('cloud.imported', 'Imported')}</Badge>
                          ) : canImport ? (
                            <Button type="button"
  onClick={(e) => {
                                e.stopPropagation();
                                handleImport(file);
                              }}
  disabled={!!importing}
  size="sm">{isImportingThis ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />}
                              {isImportingThis ? 'Importando...' : 'Importar'}
                            </Button>
                          ) : null}
                        </ItemActions>
                      </Item>
                    );
                  })}
                </ItemGroup>
              )}
            </div>

            {/* Footer */}
            <DialogFooter className="items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {selectedAccount.email} · {files.filter((f) => !f.isFolder).length} archivos
              </span>
              <Button type="button"
  variant="secondary"
  onClick={onClose}
  size="sm">
                Cerrar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
