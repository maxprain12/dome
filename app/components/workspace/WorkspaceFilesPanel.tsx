'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  FolderOpenIcon,
  FilePlusIcon,
  Folder01Icon,
  File01Icon,
  RefreshIcon,
  FolderCodeIcon,
  TerminalIcon,
  PackageIcon,
  Loading03Icon,
  LeftToRightListBulletIcon,
  File02Icon,
} from '@hugeicons/core-free-icons';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      setError(t('workspaceFiles.file_api_unavailable'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await electron.file.listDirectory(workspacePath);
      if (result?.success && Array.isArray(result.data)) {
        setEntries(result.data);
      } else {
        setError(result?.error || t('workspaceFiles.list_dir_failed'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('workspaceFiles.list_dir_error');
      setError(msg);
      console.error('[WorkspaceFilesPanel] loadEntries error:', err);
    } finally {
      setLoading(false);
    }
  }, [workspacePath, t]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleSelectFolder = useCallback(async () => {
    const electron = typeof window !== 'undefined' ? window.electron : undefined;
    if (!electron?.selectFolder) {
      setError(t('workspaceFiles.select_folder_desktop_only'));
      return;
    }

    setError(null);
    try {
      const path = await electron.selectFolder();
      if (path) {
        await onWorkspacePathChange(path);
        setLoading(true);
        try {
          const result = await electron.file?.listDirectory?.(path);
          if (result?.success && result.data) {
            setEntries(result.data);
          }
        } catch {
          setEntries([]);
        } finally {
          setLoading(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('workspaceFiles.select_folder_error');
      setError(msg);
      console.error('[WorkspaceFilesPanel] handleSelectFolder error:', err);
    }
  }, [onWorkspacePathChange, t]);

  const handleAddFile = useCallback(async () => {
    if (!workspacePath?.trim()) {
      setError(t('workspaceFiles.pick_workspace_first'));
      return;
    }
    const electron = typeof window !== 'undefined' ? window.electron : undefined;
    if (!electron?.selectFile || !electron?.file?.copyFile) {
      setError(t('workspaceFiles.file_api_unavailable'));
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
        setError(result?.error || t('workspaceFiles.copy_file_failed'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('workspaceFiles.add_file_error');
      setError(msg);
      console.error('[WorkspaceFilesPanel] handleAddFile error:', err);
    } finally {
      setAddingFile(false);
    }
  }, [workspacePath, loadEntries, t]);

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
        setError(result?.error || t('workspaceFiles.create_venv_failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceFiles.create_venv_error'));
    } finally {
      setVenvCreating(false);
    }
  }, [workspacePath, onVenvPathChange, t]);

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
        setError(check?.error || t('workspaceFiles.invalid_venv'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceFiles.verify_venv_error'));
    }
  }, [onVenvPathChange, t]);

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
        setError(result?.error || t('workspaceFiles.pip_install_failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceFiles.pip_install_packages_error'));
    } finally {
      setPipInstalling(false);
    }
  }, [venvPath, pipInput, t]);

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
        setError(result?.error || t('workspaceFiles.pip_list_failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceFiles.pip_list_error'));
    } finally {
      setPipListLoading(false);
    }
  }, [venvPath, t]);

  const handlePipInstallFromRequirements = useCallback(async () => {
    if (!venvPath?.trim() || !window.electron?.notebook?.pipInstallFromRequirements || !window.electron?.selectFile) return;
    const paths = await window.electron.selectFile({
      filters: [
        { name: t('workspaceFiles.filter_requirements_txt'), extensions: ['txt'] },
        { name: t('workspaceFiles.filter_all_files'), extensions: ['*'] },
      ],
    });
    if (!paths?.length || !paths[0]) return;
    setPipRequirementsInstalling(true);
    setError(null);
    try {
      const result = await window.electron.notebook.pipInstallFromRequirements(venvPath, paths[0]);
      if (!result?.success) {
        setError(result?.error || t('workspaceFiles.pip_requirements_failed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceFiles.pip_requirements_error'));
    } finally {
      setPipRequirementsInstalling(false);
    }
  }, [venvPath, t]);

  if (!workspacePath) {
    return (
      <WorkspaceEmptyState
        error={error}
        showVenvSection={useElectron && !!onVenvPathChange}
        venvCreating={venvCreating}
        onSelectFolder={handleSelectFolder}
        onCreateVenv={handleCreateVenv}
        onSelectVenv={handleSelectVenv}
      />
    );
  }

  return (
    <WorkspaceFilesView
      workspacePath={workspacePath}
      venvPath={venvPath}
      onClearVenv={() => onVenvPathChange?.('')}
      entries={entries}
      loading={loading}
      error={error}
      addingFile={addingFile}
      pipInstalling={pipInstalling}
      pipInput={pipInput}
      pipListLoading={pipListLoading}
      pipListOutput={pipListOutput}
      pipListExpanded={pipListExpanded}
      pipRequirementsInstalling={pipRequirementsInstalling}
      venvCreating={venvCreating}
      onSelectFolder={handleSelectFolder}
      onAddFile={handleAddFile}
      onRefresh={loadEntries}
      onSelectVenv={handleSelectVenv}
      onCreateVenv={handleCreateVenv}
      onPipList={handlePipList}
      onPipInstallFromRequirements={handlePipInstallFromRequirements}
      onPipInputChange={setPipInput}
      onPipInstall={handlePipInstall}
      onTogglePipList={() => setPipListExpanded((v) => !v)}
      showVenvSection={useElectron && !!onVenvPathChange}
    />
  );
}

interface WorkspaceEmptyStateProps {
  error: string | null;
  showVenvSection: boolean;
  venvCreating: boolean;
  onSelectFolder: () => void;
  onCreateVenv: () => void;
  onSelectVenv: () => void;
}

function WorkspaceEmptyState({
  error,
  showVenvSection,
  venvCreating,
  onSelectFolder,
  onCreateVenv,
  onSelectVenv,
}: WorkspaceEmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col min-h-0">
      <div
        className="flex-1 flex flex-col items-center justify-center p-6 text-center min-h-[280px]"
        style={{
          background: 'linear-gradient(180deg, var(--card) 0%, var(--background) 100%)',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-xl)',
          margin: '12px',
        }}
      >
        <div
          className="flex items-center justify-center size-14 rounded-2xl mb-4"
          style={{
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            color: 'var(--primary)',
          }}
        >
          <HugeiconsIcon icon={FolderCodeIcon} size={28} strokeWidth={1.5} />
        </div>
        <h3 className="text-sm font-semibold mb-1.5 text-foreground">
          {t('workspaceFiles.empty_title')}
        </h3>
        <p className="text-xs max-w-[200px] mb-5 leading-relaxed text-muted-foreground">
          {t('workspaceFiles.empty_description')}
        </p>
        <button
          type="button"
          onClick={onSelectFolder}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-[opacity,transform,box-shadow] duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shadow-sm"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
        >
          <HugeiconsIcon icon={FolderOpenIcon} size={18} />
          {t('workspaceFiles.select_folder_btn')}
        </button>
        {error ? (
          <p className="mt-3 text-xs max-w-[220px] text-destructive">
            {error}
          </p>
        ) : null}
        {showVenvSection ? (
          <div className="mt-6 pt-6 border-t w-full max-w-[240px] border-border">
            <p className="text-xs font-medium mb-2 text-muted-foreground">
              {t('workspaceFiles.python_env_heading')}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={onCreateVenv}
                disabled={venvCreating}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              >
                <VenvButtonIcon creating={venvCreating} />
                {venvCreating ? t('workspaceFiles.creating') : t('workspaceFiles.create_venv')}
              </button>
              <button
                type="button"
                onClick={onSelectVenv}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
              >
                <HugeiconsIcon icon={FolderOpenIcon} size={14} />
                {t('workspaceFiles.select_venv')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VenvButtonIcon({ creating }: { creating: boolean }) {
  if (creating) {
    return <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />;
  }
  return <HugeiconsIcon icon={TerminalIcon} size={14} />;
}

interface WorkspaceFilesViewProps {
  workspacePath: string;
  venvPath: string | undefined;
  onClearVenv: () => void;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
  addingFile: boolean;
  pipInstalling: boolean;
  pipInput: string;
  pipListLoading: boolean;
  pipListOutput: string | null;
  pipListExpanded: boolean;
  pipRequirementsInstalling: boolean;
  venvCreating: boolean;
  onSelectFolder: () => void;
  onAddFile: () => void;
  onRefresh: () => void;
  onSelectVenv: () => void;
  onCreateVenv: () => void;
  onPipList: () => void;
  onPipInstallFromRequirements: () => void;
  onPipInputChange: (value: string) => void;
  onPipInstall: () => void;
  onTogglePipList: () => void;
  showVenvSection: boolean;
}

function WorkspaceFilesView({
  workspacePath,
  venvPath,
  onClearVenv,
  entries,
  loading,
  error,
  addingFile,
  pipInstalling,
  pipInput,
  pipListLoading,
  pipListOutput,
  pipListExpanded,
  pipRequirementsInstalling,
  venvCreating,
  onSelectFolder,
  onAddFile,
  onRefresh,
  onSelectVenv,
  onCreateVenv,
  onPipList,
  onPipInstallFromRequirements,
  onPipInputChange,
  onPipInstall,
  onTogglePipList,
  showVenvSection,
}: WorkspaceFilesViewProps) {
  return (
    <div className="flex flex-col gap-4 p-4 h-full min-h-0 overflow-hidden">
      <WorkspacePathHeader workspacePath={workspacePath} />

      <ActionButtons
        addingFile={addingFile}
        loading={loading}
        onSelectFolder={onSelectFolder}
        onAddFile={onAddFile}
        onRefresh={onRefresh}
      />

      {error ? (
        <div
          className="px-3 py-2 rounded-lg text-xs shrink-0"
          style={{ background: 'color-mix(in srgb, var(--destructive) 12%, transparent)', color: 'var(--destructive)', border: '1px solid var(--destructive)' }}
        >
          {error}
        </div>
      ) : null}

      {showVenvSection ? (
        <PythonEnvPanel
          venvPath={venvPath}
          pipInstalling={pipInstalling}
          pipInput={pipInput}
          pipListLoading={pipListLoading}
          pipListOutput={pipListOutput}
          pipListExpanded={pipListExpanded}
          pipRequirementsInstalling={pipRequirementsInstalling}
          venvCreating={venvCreating}
          onSelectVenv={onSelectVenv}
          onCreateVenv={onCreateVenv}
          onClearVenv={onClearVenv}
          onPipList={onPipList}
          onPipInstallFromRequirements={onPipInstallFromRequirements}
          onPipInputChange={onPipInputChange}
          onPipInstall={onPipInstall}
          onTogglePipList={onTogglePipList}
        />
      ) : null}

      <FileList entries={entries} loading={loading} />
    </div>
  );
}

function WorkspacePathHeader({ workspacePath }: { workspacePath: string }) {
  const { t } = useTranslation();
  return (
    <div className="shrink-0">
      <h4 className="text-xs font-semibold flex items-center gap-2 mb-2 text-foreground">
        <HugeiconsIcon icon={Folder01Icon} size={14} className="text-primary" />
        {t('workspaceFiles.workspace_files_heading')}
      </h4>
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="flex items-center justify-center size-8 rounded-lg shrink-0"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
        >
          <HugeiconsIcon icon={Folder01Icon} size={16} />
        </div>
        <span
          className="text-xs truncate flex-1 font-medium text-foreground"
          title={workspacePath}
        >
          {workspacePath}
        </span>
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  addingFile: boolean;
  loading: boolean;
  onSelectFolder: () => void;
  onAddFile: () => void;
  onRefresh: () => void;
}

function ActionButtons({ addingFile, loading, onSelectFolder, onAddFile, onRefresh }: ActionButtonsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2 shrink-0">
      <button
        type="button"
        onClick={onSelectFolder}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-[background-color,box-shadow] hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        style={{
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
        }}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} />
        {t('workspaceFiles.change_folder')}
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddFile(); }}
        disabled={addingFile}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-[opacity,box-shadow] hover:opacity-90 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer disabled:cursor-not-allowed"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        title={t('workspaceFiles.copy_file_title')}
      >
        <HugeiconsIcon icon={FilePlusIcon} size={14} />
        {addingFile ? t('workspaceFiles.adding') : t('workspaceFiles.add_file')}
      </button>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRefresh(); }}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-[background-color,opacity,box-shadow] hover:bg-accent disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer"
        style={{
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
        }}
        aria-label={t('workspaceFiles.refresh')}
        title={t('workspaceFiles.refreshFiles')}
      >
        <HugeiconsIcon icon={RefreshIcon} size={14} className={loading ? 'animate-spin shrink-0' : 'shrink-0'} />
        <span>{loading ? t('workspaceFiles.updating') : t('workspaceFiles.refresh')}</span>
      </button>
    </div>
  );
}

interface PythonEnvPanelProps {
  venvPath: string | undefined;
  pipInstalling: boolean;
  pipInput: string;
  pipListLoading: boolean;
  pipListOutput: string | null;
  pipListExpanded: boolean;
  pipRequirementsInstalling: boolean;
  venvCreating: boolean;
  onSelectVenv: () => void;
  onCreateVenv: () => void;
  onClearVenv: () => void;
  onPipList: () => void;
  onPipInstallFromRequirements: () => void;
  onPipInputChange: (value: string) => void;
  onPipInstall: () => void;
  onTogglePipList: () => void;
}

function PythonEnvPanel({
  venvPath,
  pipInstalling,
  pipInput,
  pipListLoading,
  pipListOutput,
  pipListExpanded,
  pipRequirementsInstalling,
  venvCreating,
  onSelectVenv,
  onCreateVenv,
  onClearVenv,
  onPipList,
  onPipInstallFromRequirements,
  onPipInputChange,
  onPipInstall,
  onTogglePipList,
}: PythonEnvPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 shrink-0 pt-2 border-t border-border">
      <h4 className="text-xs font-semibold flex items-center gap-2 text-foreground">
        <HugeiconsIcon icon={TerminalIcon} size={14} className="text-primary" />
        {t('workspaceFiles.python_env_heading')}
      </h4>
      {venvPath ? (
        <PythonEnvConfigured
          venvPath={venvPath}
          pipInstalling={pipInstalling}
          pipInput={pipInput}
          pipListLoading={pipListLoading}
          pipListOutput={pipListOutput}
          pipListExpanded={pipListExpanded}
          pipRequirementsInstalling={pipRequirementsInstalling}
          onSelectVenv={onSelectVenv}
          onClearVenv={onClearVenv}
          onPipList={onPipList}
          onPipInstallFromRequirements={onPipInstallFromRequirements}
          onPipInputChange={onPipInputChange}
          onPipInstall={onPipInstall}
          onTogglePipList={onTogglePipList}
        />
      ) : (
        <PythonEnvEmpty
          venvCreating={venvCreating}
          onSelectVenv={onSelectVenv}
          onCreateVenv={onCreateVenv}
        />
      )}
    </div>
  );
}

interface PythonEnvConfiguredProps {
  venvPath: string;
  pipInstalling: boolean;
  pipInput: string;
  pipListLoading: boolean;
  pipListOutput: string | null;
  pipListExpanded: boolean;
  pipRequirementsInstalling: boolean;
  onSelectVenv: () => void;
  onClearVenv: () => void;
  onPipList: () => void;
  onPipInstallFromRequirements: () => void;
  onPipInputChange: (value: string) => void;
  onPipInstall: () => void;
  onTogglePipList: () => void;
}

function PythonEnvConfigured({
  venvPath,
  pipInstalling,
  pipInput,
  pipListLoading,
  pipListOutput,
  pipListExpanded,
  pipRequirementsInstalling,
  onSelectVenv,
  onClearVenv,
  onPipList,
  onPipInstallFromRequirements,
  onPipInputChange,
  onPipInstall,
  onTogglePipList,
}: PythonEnvConfiguredProps) {
  const { t } = useTranslation();
  return (
    <>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs truncate"
        style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
        title={venvPath}
      >
        <HugeiconsIcon icon={Folder01Icon} size={14} className="shrink-0" />
        <span className="truncate">{venvPath}</span>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        <button
          type="button"
          onClick={onSelectVenv}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          <HugeiconsIcon icon={FolderOpenIcon} size={14} />
          {t('workspaceFiles.change_folder')}
        </button>
        <button
          type="button"
          onClick={onClearVenv}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: 'var(--card)',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)',
          }}
        >
          {t('workspaceFiles.use_system_python')}
        </button>
        <button
          type="button"
          onClick={onPipList}
          disabled={pipListLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          <PipButtonIcon loading={pipListLoading} icon={LeftToRightListBulletIcon} />
          {t('workspaceFiles.list_packages')}
        </button>
        <button
          type="button"
          onClick={onPipInstallFromRequirements}
          disabled={pipRequirementsInstalling}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
          style={{
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          <PipButtonIcon loading={pipRequirementsInstalling} icon={File02Icon} />
          {t('workspaceFiles.requirements')}
        </button>
      </div>
      {pipListOutput ? (
        <PipListOutput
          output={pipListOutput}
          expanded={pipListExpanded}
          onToggle={onTogglePipList}
        />
      ) : null}
      <div className="flex gap-2 shrink-0 min-w-0">
        <input
          type="text"
          placeholder={t('workspaceFiles.pip_placeholder')}
          aria-label={t('workspaceFiles.pip_placeholder')}
          value={pipInput}
          onChange={(e) => onPipInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onPipInstall()}
          className="flex-1 min-w-0 p-2 rounded-lg text-xs"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        />
        <button
          type="button"
          onClick={onPipInstall}
          disabled={pipInstalling || !pipInput.trim()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium shrink-0"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <PipInstallButtonIcon installing={pipInstalling} />
          {t('workspaceFiles.install')}
        </button>
      </div>
    </>
  );
}

interface PythonEnvEmptyProps {
  venvCreating: boolean;
  onSelectVenv: () => void;
  onCreateVenv: () => void;
}

function PythonEnvEmpty({ venvCreating, onSelectVenv, onCreateVenv }: PythonEnvEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onCreateVenv}
        disabled={venvCreating}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <VenvButtonIcon creating={venvCreating} />
        {venvCreating ? t('workspaceFiles.creating') : t('workspaceFiles.create_venv')}
      </button>
      <button
        type="button"
        onClick={onSelectVenv}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
        style={{
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
        }}
      >
        <HugeiconsIcon icon={FolderOpenIcon} size={14} />
        {t('workspaceFiles.select_venv')}
      </button>
    </div>
  );
}

function PipButtonIcon({ loading, icon }: { loading: boolean; icon: typeof LeftToRightListBulletIcon }) {
  if (loading) {
    return <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />;
  }
  return <HugeiconsIcon icon={icon} size={14} />;
}

function PipInstallButtonIcon({ installing }: { installing: boolean }) {
  if (installing) {
    return <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />;
  }
  return <HugeiconsIcon icon={PackageIcon} size={14} />;
}

interface PipListOutputProps {
  output: string;
  expanded: boolean;
  onToggle: () => void;
}

function PipListOutput({ output, expanded, onToggle }: PipListOutputProps) {
  const { t } = useTranslation();
  return (
    <div
      className="rounded-lg overflow-hidden border shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--muted)' }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-medium"
        style={{ color: 'var(--foreground)' }}
      >
        {t('workspaceFiles.installed_packages')}
        <span className="text-[10px] text-muted-foreground">
          {expanded ? t('workspaceFiles.hide') : t('workspaceFiles.show')}
        </span>
      </button>
      {expanded ? (
        <pre
          className="px-3 py-2 text-[11px] overflow-auto max-h-40 whitespace-pre-wrap break-words"
          style={{ color: 'var(--muted-foreground)', borderTop: '1px solid var(--border)' }}
        >
          {output}
        </pre>
      ) : null}
    </div>
  );
}

interface FileListProps {
  entries: DirEntry[];
  loading: boolean;
}

function FileList({ entries, loading }: FileListProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border flex items-center justify-center py-12" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <HugeiconsIcon icon={RefreshIcon} size={24} className="animate-spin text-primary" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <HugeiconsIcon icon={File01Icon} size={32} className="mb-2 opacity-30 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {t('workspaceFiles.empty_folder_title')}
          </p>
          <p className="text-xs mt-0.5 text-muted-foreground">
            {t('workspaceFiles.empty_folder_hint')}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
      <ul className="py-1">
        {entries.map((e) => (
          <li
            key={e.path}
            className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-sm transition-colors hover:bg-accent text-foreground"
          >
            {e.isDirectory ? (
              <HugeiconsIcon icon={Folder01Icon} size={16} className="shrink-0 opacity-70 text-primary" />
            ) : (
              <HugeiconsIcon icon={File01Icon} size={16} className="shrink-0 opacity-60 text-muted-foreground" />
            )}
            <span className="truncate" title={e.name}>
              {e.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
