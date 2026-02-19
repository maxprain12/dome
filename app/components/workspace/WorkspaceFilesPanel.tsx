'use client';

import { useState, useEffect, useCallback } from 'react';
import { FolderOpen, FilePlus, Folder, File, RefreshCw, FolderGit2, Terminal, Package, Loader2, List, FileText } from 'lucide-react';

interface WorkspaceFilesPanelProps {
  workspacePath: string | undefined;
  onWorkspacePathChange: (path: string) => Promise<void>;
  /** Python venv path (Electron only) */
  venvPath?: string;
  onVenvPathChange?: (path: string) => Promise<void>;
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

const useElectron = typeof window !== 'undefined' && !!window.electron?.notebook;

export default function WorkspaceFilesPanel({
  workspacePath,
  onWorkspacePathChange,
  venvPath,
  onVenvPathChange,
}: WorkspaceFilesPanelProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingFile, setAddingFile] = useState(false);
  const [venvCreating, setVenvCreating] = useState(false);
  const [pipInstalling, setPipInstalling] = useState(false);
  const [pipInput, setPipInput] = useState('');
  const [pipListLoading, setPipListLoading] = useState(false);
  const [pipListOutput, setPipListOutput] = useState<string | null>(null);
  const [pipListExpanded, setPipListExpanded] = useState(false);
  const [pipRequirementsInstalling, setPipRequirementsInstalling] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!workspacePath?.trim()) return;
    const electron = typeof window !== 'undefined' ? window.electron : undefined;
    if (!electron?.file?.listDirectory) {
      setError('API de archivos no disponible');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await electron.file.listDirectory(workspacePath);
      if (result?.success && Array.isArray(result.data)) {
        setEntries(result.data);
      } else {
        setError(result?.error || 'No se pudo listar el directorio');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al listar directorio';
      setError(msg);
      console.error('[WorkspaceFilesPanel] loadEntries error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSelectFolder = useCallback(async () => {
    if (!window.electron?.selectFolder) return;

    const path = await window.electron.selectFolder();
    if (path) {
      await onWorkspacePathChange(path);
      setError(null);
      setLoading(true);
      try {
        const result = await window.electron.file.listDirectory(path);
        if (result?.success && result.data) {
          setEntries(result.data);
        }
      } catch {
        setEntries([]);
      } finally {
        setLoading(false);
      }
    }
  }, [onWorkspacePathChange]);

  const handleAddFile = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setError('Selecciona primero una carpeta de workspace');
      return;
    }
    const electron = typeof window !== 'undefined' ? window.electron : undefined;
    if (!electron?.selectFile || !electron?.file?.copyFile) {
      setError('API de archivos no disponible');
      return;
    }

    setAddingFile(true);
    setError(null);
    try {
      const paths = await electron.selectFile();
      const filePath = Array.isArray(paths) && paths.length > 0 ? paths[0] : null;
      if (!filePath) {
        setAddingFile(false);
        return;
      }

      const parts = String(filePath).split(/[/\\]/);
      const fileName = parts[parts.length - 1]?.trim() || 'file';
      const base = workspacePath.replace(/[/\\]+$/, '');
      const sep = workspacePath.includes('\\') ? '\\' : '/';
      const destPath = `${base}${sep}${fileName}`;

      const result = await electron.file.copyFile(String(filePath), destPath);
      if (result?.success) {
        await loadEntries();
      } else {
        setError(result?.error || 'No se pudo copiar el archivo');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al añadir archivo';
      setError(msg);
      console.error('[WorkspaceFilesPanel] handleAddFile error:', err);
    } finally {
      setAddingFile(false);
    }
  }, [workspacePath, loadEntries]);

  const handleCreateVenv = useCallback(async () => {
    const base = workspacePath?.trim() || (await window.electron?.selectFolder?.());
    if (!base || !onVenvPathChange || !window.electron?.notebook?.createVenv) return;
    setVenvCreating(true);
    setError(null);
    try {
      const result = await window.electron.notebook.createVenv(base);
      if (result?.success && result.venvPath) {
        await onVenvPathChange(result.venvPath);
      } else {
        setError(result?.error || 'No se pudo crear el venv');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear venv');
    } finally {
      setVenvCreating(false);
    }
  }, [workspacePath, onVenvPathChange]);

  const handleSelectVenv = useCallback(async () => {
    if (!window.electron?.selectFolder || !onVenvPathChange || !window.electron?.notebook?.checkVenv) return;
    const path = await window.electron.selectFolder();
    if (!path) return;
    setError(null);
    try {
      const check = await window.electron.notebook.checkVenv(path);
      if (check?.valid) {
        await onVenvPathChange(path);
      } else {
        setError(check?.error || 'No es un venv válido (debe tener bin/python o Scripts/python.exe)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar venv');
    }
  }, [onVenvPathChange]);

  const handlePipInstall = useCallback(async () => {
    if (!venvPath?.trim() || !pipInput.trim() || !window.electron?.notebook?.pipInstall || !pipInput.trim().split(/\s+/).some(Boolean)) return;
    const pkgs = pipInput.trim().split(/\s+/).filter(Boolean);
    setPipInstalling(true);
    setError(null);
    try {
      const result = await window.electron.notebook.pipInstall(venvPath, pkgs);
      if (result?.success) {
        setPipInput('');
      } else {
        setError(result?.error || 'pip install falló');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al instalar paquetes');
    } finally {
      setPipInstalling(false);
    }
  }, [venvPath, pipInput]);

  const handlePipList = useCallback(async () => {
    if (!venvPath?.trim() || !window.electron?.notebook?.pipList) return;
    setPipListLoading(true);
    setError(null);
    setPipListOutput(null);
    try {
      const result = await window.electron.notebook.pipList(venvPath);
      if (result?.success && result.stdout) {
        setPipListOutput(result.stdout);
        setPipListExpanded(true);
      } else {
        setError(result?.error || 'No se pudo listar paquetes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al listar paquetes');
    } finally {
      setPipListLoading(false);
    }
  }, [venvPath]);

  const handlePipInstallFromRequirements = useCallback(async () => {
    if (!venvPath?.trim() || !window.electron?.notebook?.pipInstallFromRequirements || !window.electron?.selectFile) return;
    const paths = await window.electron.selectFile({
      filters: [
        { name: 'requirements.txt', extensions: ['txt'] },
        { name: 'Todos los archivos', extensions: ['*'] },
      ],
    });
    if (!paths?.length || !paths[0]) return;
    setPipRequirementsInstalling(true);
    setError(null);
    try {
      const result = await window.electron.notebook.pipInstallFromRequirements(venvPath, paths[0]);
      if (!result?.success) {
        setError(result?.error || 'pip install -r falló');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al instalar desde requirements.txt');
    } finally {
      setPipRequirementsInstalling(false);
    }
  }, [venvPath]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {!workspacePath ? (
        /* Empty state - invitación clara a configurar */
        <div
          className="flex-1 flex flex-col items-center justify-center p-6 text-center min-h-[280px]"
          style={{
            background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg) 100%)',
            border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-xl)',
            margin: '12px',
          }}
        >
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              background: 'var(--translucent)',
              color: 'var(--accent)',
            }}
          >
            <FolderGit2 size={28} strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--primary-text)' }}>
            Workspace del Notebook
          </h3>
          <p className="text-xs max-w-[200px] mb-5 leading-relaxed" style={{ color: 'var(--secondary-text)' }}>
            Selecciona una carpeta para usar como directorio de trabajo al ejecutar las celdas Python.
          </p>
          <button
            type="button"
            onClick={handleSelectFolder}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 shadow-sm"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <FolderOpen size={18} />
            Seleccionar carpeta
          </button>
          {useElectron && onVenvPathChange && (
            <div className="mt-6 pt-6 border-t w-full max-w-[240px]" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--secondary-text)' }}>
                Entorno Python
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={handleCreateVenv}
                  disabled={venvCreating}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
                >
                  {venvCreating ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                  {venvCreating ? 'Creando...' : 'Crear venv'}
                </button>
                <button
                  type="button"
                  onClick={handleSelectVenv}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{ background: 'var(--bg-secondary)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
                >
                  <FolderOpen size={14} />
                  Seleccionar venv
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 h-full min-h-0 overflow-hidden">
          {/* Workspace (archivos) */}
          <div className="shrink-0">
            <h4 className="text-xs font-semibold flex items-center gap-2 mb-2" style={{ color: 'var(--primary-text)' }}>
              <Folder size={14} style={{ color: 'var(--accent)' }} />
              Workspace (archivos)
            </h4>
            <div
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                style={{ background: 'var(--translucent)', color: 'var(--accent)' }}
              >
                <Folder size={16} />
              </div>
              <span
                className="text-xs truncate flex-1 font-medium"
                style={{ color: 'var(--primary-text)' }}
                title={workspacePath}
              >
                {workspacePath}
              </span>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-[var(--bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
            >
              <FolderOpen size={14} />
              Cambiar
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddFile(); }}
              disabled={addingFile}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'white' }}
              title="Copiar un archivo al workspace"
            >
              <FilePlus size={14} />
              {addingFile ? 'Añadiendo...' : 'Añadir archivo'}
            </button>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); loadEntries(); }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:bg-[var(--bg-hover)] disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 cursor-pointer"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--primary-text)',
                border: '1px solid var(--border)',
              }}
              aria-label="Actualizar listado"
              title="Refrescar lista de archivos"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin shrink-0' : 'shrink-0'} />
              <span>{loading ? 'Actualizando...' : 'Actualizar'}</span>
            </button>
          </div>

          {error && (
            <div
              className="px-3 py-2 rounded-lg text-xs shrink-0"
              style={{ background: 'var(--error-bg)', color: 'var(--error)', border: '1px solid var(--error)' }}
            >
              {error}
            </div>
          )}

          {/* Entorno Python (Electron only) */}
          {useElectron && onVenvPathChange && (
            <div
              className="flex flex-col gap-3 shrink-0 pt-2 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <h4 className="text-xs font-semibold flex items-center gap-2" style={{ color: 'var(--primary-text)' }}>
                <Terminal size={14} style={{ color: 'var(--accent)' }} />
                Entorno Python
              </h4>
              {venvPath ? (
                <>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs truncate"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--primary-text)' }}
                    title={venvPath}
                  >
                    <Folder size={14} className="shrink-0" />
                    <span className="truncate">{venvPath}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleSelectVenv}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--primary-text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <FolderOpen size={14} />
                      Cambiar
                    </button>
                    <button
                      type="button"
                      onClick={() => onVenvPathChange?.('')}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--secondary-text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      Usar sistema
                    </button>
                    <button
                      type="button"
                      onClick={handlePipList}
                      disabled={pipListLoading}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--primary-text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {pipListLoading ? <Loader2 size={14} className="animate-spin" /> : <List size={14} />}
                      Ver paquetes
                    </button>
                    <button
                      type="button"
                      onClick={handlePipInstallFromRequirements}
                      disabled={pipRequirementsInstalling}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                      style={{
                        background: 'var(--bg-secondary)',
                        color: 'var(--primary-text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {pipRequirementsInstalling ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                      requirements.txt
                    </button>
                  </div>
                  {pipListOutput && (
                    <div
                      className="rounded-lg overflow-hidden border shrink-0"
                      style={{ borderColor: 'var(--border)', background: 'var(--bg-tertiary)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setPipListExpanded(!pipListExpanded)}
                        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium"
                        style={{ color: 'var(--primary-text)' }}
                      >
                        Paquetes instalados
                        <span className="text-[10px]" style={{ color: 'var(--tertiary-text)' }}>
                          {pipListExpanded ? 'Ocultar' : 'Ver'}
                        </span>
                      </button>
                      {pipListExpanded && (
                        <pre
                          className="px-3 py-2 text-[11px] overflow-auto max-h-40 whitespace-pre-wrap break-words"
                          style={{ color: 'var(--secondary-text)', borderTop: '1px solid var(--border)' }}
                        >
                          {pipListOutput}
                        </pre>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 shrink-0 min-w-0">
                    <input
                      type="text"
                      placeholder="pip install pandas matplotlib..."
                      value={pipInput}
                      onChange={(e) => setPipInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePipInstall()}
                      className="flex-1 min-w-0 px-2 py-2 rounded-lg text-xs"
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        color: 'var(--primary-text)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handlePipInstall}
                      disabled={pipInstalling || !pipInput.trim()}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium shrink-0"
                      style={{ background: 'var(--accent)', color: 'white' }}
                    >
                      {pipInstalling ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
                      Instalar
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCreateVenv}
                    disabled={venvCreating}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--accent)', color: 'white' }}
                  >
                    {venvCreating ? <Loader2 size={14} className="animate-spin" /> : <Terminal size={14} />}
                    {venvCreating ? 'Creando...' : 'Crear venv'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectVenv}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
                    style={{
                      background: 'var(--bg-secondary)',
                      color: 'var(--primary-text)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <FolderOpen size={14} />
                    Seleccionar venv
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lista de archivos */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <File size={32} className="mb-2 opacity-30" style={{ color: 'var(--secondary-text)' }} />
                <p className="text-xs" style={{ color: 'var(--secondary-text)' }}>
                  Sin archivos en esta carpeta
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--tertiary-text)' }}>
                  Añade archivos con el botón de arriba
                </p>
              </div>
            ) : (
              <ul className="py-1">
                {entries.map((e) => (
                  <li
                    key={e.path}
                    className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-sm transition-colors hover:bg-[var(--bg-hover)]"
                    style={{
                      color: 'var(--primary-text)',
                    }}
                  >
                    {e.isDirectory ? (
                      <Folder size={16} className="shrink-0 opacity-70" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <File size={16} className="shrink-0 opacity-60" style={{ color: 'var(--secondary-text)' }} />
                    )}
                    <span className="truncate" title={e.name}>
                      {e.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
