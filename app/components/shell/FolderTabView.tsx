import { useMemo, useCallback, useState, useRef, useEffect, Fragment } from 'react';
import { ScrollArea, Stack, UnstyledButton, Text } from '@mantine/core';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import {
  FolderOpen, Plus, Home, ChevronRight,
  Pencil, X, Check, Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useResources, type Resource } from '@/lib/hooks/useResources';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import MoveToProjectModal, { filterMoveProjectRoots } from '@/components/workspace/MoveToProjectModal';
import SelectionActionBar from '@/components/home/SelectionActionBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FolderTabViewProps {
  folderId: string;
  folderTitle: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Subcomponentes extraídos (03/T02) — misma UI, archivos por pieza.
import { getFolderColor } from './folder-tab/folderTabShared';
import ColorPickerPopover from './folder-tab/ColorPickerPopover';
import SubfolderCard from './folder-tab/SubfolderCard';
import FileRow from './folder-tab/FileRow';
import NewFolderInline from './folder-tab/NewFolderInline';
import AddMenu from './folder-tab/AddMenu';

export default function FolderTabView({ folderId, folderTitle }: FolderTabViewProps) {
  const { t } = useTranslation();
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [moveProjectIds, setMoveProjectIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [folderPickOpen, setFolderPickOpen] = useState(false);
  const showSelectionChrome = selectedIds.size > 0;

  // Current folder header editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [headerHovered, setHeaderHovered] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const {
    folders: subfolders,
    nonFolderResources: files,
    isLoading,
    createResource,
    deleteResource,
    updateResource,
    getFolderById,
    getBreadcrumbPath,
    refetch,
    allFolders,
    moveToFolder,
  } = useResources({ folderId, sortBy: 'updated_at', sortOrder: 'desc' });

  const resourceMapForSelection = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const f of subfolders) m.set(f.id, f);
    for (const f of files) m.set(f.id, f);
    for (const p of getBreadcrumbPath(folderId)) m.set(p.id, p);
    const cur = getFolderById(folderId);
    if (cur) m.set(cur.id, cur);
    return m;
  }, [subfolders, files, folderId, getBreadcrumbPath, getFolderById]);

  const toggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleBulkMoveToFolder = useCallback(
    async (targetFolderId: string | null) => {
      const roots = filterMoveProjectRoots(selectedIds, resourceMapForSelection);
      for (const rid of roots) {
        const ok = await moveToFolder(rid, targetFolderId);
        if (!ok) break;
      }
      setSelectedIds(new Set());
      setFolderPickOpen(false);
      await refetch();
    },
    [selectedIds, resourceMapForSelection, moveToFolder, refetch],
  );

  const handleBulkDelete = useCallback(async () => {
    const n = selectedIds.size;
    if (!window.confirm(t('selection.bulk_delete_confirm', { count: n }))) return;
    const res = await window.electron?.db?.resources?.bulkDelete([...selectedIds]);
    if (res?.success) {
      setSelectedIds(new Set());
      await refetch();
    }
  }, [selectedIds, refetch, t]);

  const { openResourceTab, openFolderTab, activateTab, updateTab } = useTabStore(
    useShallow((s) => ({
      openResourceTab: s.openResourceTab,
      openFolderTab: s.openFolderTab,
      activateTab: s.activateTab,
      updateTab: s.updateTab,
    })),
  );
  const setCurrentFolderId = useAppStore((s) => s.setCurrentFolderId);
  const currentProject = useAppStore((s) => s.currentProject);

  // Keep app store in sync so Many AI knows which folder is active
  useEffect(() => {
    setCurrentFolderId(folderId);
    return () => { setCurrentFolderId(null); };
  }, [folderId, setCurrentFolderId]);

  const currentFolder = getFolderById(folderId);
  const effectiveProjectId = currentFolder?.project_id ?? currentProject?.id ?? 'default';

  const folderTargetsForMove = useMemo(
    () =>
      allFolders.filter(
        (f) =>
          f.project_id === effectiveProjectId &&
          f.id !== folderId &&
          !selectedIds.has(f.id),
      ),
    [allFolders, effectiveProjectId, folderId, selectedIds],
  );

  const breadcrumb = useMemo(
    () => getBreadcrumbPath(folderId).filter((f) => f.id !== folderId),
    [folderId, getBreadcrumbPath],
  );
  const folderColor = currentFolder ? getFolderColor(currentFolder) : 'var(--dome-accent)';
  const folderColorHex = folderColor.startsWith('#') ? folderColor : null;

  // Sync stored color to tab on mount and whenever it changes
  useEffect(() => {
    if (folderColorHex) updateTab(`folder:${folderId}`, { color: folderColorHex });
  }, [folderId, folderColorHex, updateTab]);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  const startEditTitle = () => {
    setTitleValue(currentFolder?.title ?? folderTitle);
    setEditingTitle(true);
  };

  const commitTitle = async () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== (currentFolder?.title ?? folderTitle)) {
      await updateResource(folderId, { title: trimmed });
      updateTab(`folder:${folderId}`, { title: trimmed });
    }
    setEditingTitle(false);
  };

  const handleCurrentFolderColor = async (color: string) => {
    const currentMeta = (currentFolder?.metadata as Record<string, unknown>) ?? {};
    await updateResource(folderId, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${folderId}`, { color });
    setColorPickerPos(null);
  };

  const openCurrentFolderColorPicker = () => {
    if (colorBtnRef.current) {
      const rect = colorBtnRef.current.getBoundingClientRect();
      setColorPickerPos({ top: rect.bottom + 8, left: rect.left });
    }
  };

  const handleCreateFolder = useCallback(async (name: string) => {
    await createResource({ type: 'folder', title: name, project_id: effectiveProjectId, content: '', folder_id: folderId });
    setCreatingFolder(false);
  }, [createResource, effectiveProjectId, folderId]);

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note', 'Nota sin título'),
      content: '',
      project_id: effectiveProjectId,
      folder_id: folderId,
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title);
    }
  }, [effectiveProjectId, folderId, t, openResourceTab]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (paths?.length) await window.electron.resource.importMultiple(paths, effectiveProjectId);
  }, [effectiveProjectId]);

  const handleAddUrl = useCallback(() => {
    const url = prompt(t('command.please_enter_url', 'Introduce una URL'));
    if (url && window.electron?.db?.resources?.create) {
      const now = Date.now();
      void window.electron.db.resources.create({
        id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'url',
        title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
        project_id: effectiveProjectId,
        folder_id: folderId,
        content: url,
        created_at: now,
        updated_at: now,
      });
    }
  }, [effectiveProjectId, folderId, t]);

  const handleDeleteFile = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDelete'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleRenameFile = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
  }, [updateResource]);

  const handleSubfolderRename = useCallback(async (id: string, newTitle: string) => {
    await updateResource(id, { title: newTitle });
    updateTab(`folder:${id}`, { title: newTitle });
  }, [updateResource, updateTab]);

  const handleSubfolderDelete = useCallback(async (id: string) => {
    if (!window.confirm(t('folder.confirmDeleteFolder', '¿Eliminar esta carpeta y todo su contenido?'))) return;
    await deleteResource(id);
  }, [deleteResource, t]);

  const handleSubfolderColor = useCallback(async (id: string, color: string, folder: Resource) => {
    const currentMeta = (folder.metadata as Record<string, unknown>) ?? {};
    await updateResource(id, { metadata: { ...currentMeta, color } });
    updateTab(`folder:${id}`, { color });
  }, [updateResource, updateTab]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--dome-text-muted)' }}>
        <div className="size-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--dome-border)', borderTopColor: 'var(--dome-accent)' }} />
      </div>
    );
  }

  const isEmpty = subfolders.length === 0 && files.length === 0 && !creatingFolder;

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: 'var(--dome-bg)' }}>
      <div className="max-w-4xl mx-auto w-full px-8 py-6 flex flex-col gap-6">

        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
          <button
            type="button"
            onClick={() => activateTab('home')}
            className="flex items-center gap-1 hover:text-[var(--dome-text)] transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <Home className="size-3" />
            <span>{t('common.home')}</span>
          </button>
          {breadcrumb.map((folder) => (
            <Fragment key={folder.id}>
              <ChevronRight className="size-3 shrink-0" />
              <button
                type="button"
                onClick={() => openFolderTab(folder.id, folder.title, getFolderColor(folder))}
                className="hover:text-[var(--dome-text)] transition-colors truncate"
                style={{ maxWidth: 120, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                title={folder.title}
              >
                {folder.title}
              </button>
            </Fragment>
          ))}
          {breadcrumb.length > 0 && <ChevronRight className="size-3 shrink-0" />}
          <span style={{ color: 'var(--dome-text)' }}>{currentFolder?.title ?? folderTitle}</span>
        </nav>

        {/* ── Folder header ── */}
        <div
          className="flex items-start justify-between gap-4"
          onMouseEnter={() => setHeaderHovered(true)}
          onMouseLeave={() => setHeaderHovered(false)}
        >
          <div className="flex items-center gap-3">
            {/* Clickable color icon */}
            <button
              ref={colorBtnRef}
              type="button"
              onClick={openCurrentFolderColorPicker}
              title={t('folder.changeColor', 'Cambiar color')}
              className="size-12 rounded-2xl flex items-center justify-center shrink-0 transition-all"
              style={{
                background: folderColorHex ? `${folderColorHex}20` : 'var(--dome-bg-hover)',
                border: 'none',
                cursor: 'pointer',
                outline: colorPickerPos ? `2px solid ${folderColor}` : 'none',
                outlineOffset: 2,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = folderColorHex ? `${folderColorHex}35` : 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = folderColorHex ? `${folderColorHex}20` : 'var(--dome-bg-hover)'; }}
            >
              <FolderOpen className="size-6" style={{ color: folderColor }} />
            </button>

            <div>
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTitle();
                      if (e.key === 'Escape') setEditingTitle(false);
                    }}
                    className="text-xl font-semibold outline-none rounded-lg px-2 py-0.5"
                    style={{ color: 'var(--dome-text)', background: 'var(--dome-bg)', border: '1.5px solid var(--dome-accent)' }}
                  />
                  <button type="button" onClick={commitTitle}
                    className="flex items-center justify-center size-7 rounded-md"
                    style={{ color: 'var(--dome-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <Check className="size-4" />
                  </button>
                  <button type="button" onClick={() => setEditingTitle(false)}
                    className="flex items-center justify-center size-7 rounded-md"
                    style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group">
                  <h1 className="text-xl font-semibold" style={{ color: 'var(--dome-text)' }}>
                    {currentFolder?.title ?? folderTitle}
                  </h1>
                  {headerHovered && (
                    <button
                      type="button"
                      onClick={startEditTitle}
                      title={t('folder.rename')}
                      className="flex items-center justify-center size-6 rounded-md transition-colors opacity-60 hover:opacity-100"
                      style={{ color: 'var(--dome-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm mt-0.5" style={{ color: 'var(--dome-text-muted)' }}>
                {t('folder.itemCount', { count: subfolders.length + files.length })}
                {subfolders.length > 0 && ` · ${t('folder.subfolderCount', { count: subfolders.length })}`}
              </p>
            </div>
          </div>

          {/* ── Actions ── */}
          <AddMenu
            onNewNote={handleNewNote}
            onNewFolder={() => setCreatingFolder(true)}
            onUpload={handleUpload}
            onAddUrl={handleAddUrl}
          />
        </div>

        <SelectionActionBar
          count={selectedIds.size}
          onMoveToFolder={() => setFolderPickOpen(true)}
          onMoveToProject={() =>
            setMoveProjectIds([...filterMoveProjectRoots(selectedIds, resourceMapForSelection)])
          }
          onDelete={() => void handleBulkDelete()}
          onDeselect={() => setSelectedIds(new Set())}
        />

        {/* ── Current folder color picker popover ── */}
        {colorPickerPos && (
          <ColorPickerPopover
            pos={colorPickerPos}
            currentColor={folderColorHex ?? 'var(--accent)'}
            onSave={handleCurrentFolderColor}
            onClose={() => setColorPickerPos(null)}
          />
        )}

        {/* ── Empty state ── */}
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="size-16 rounded-2xl flex items-center justify-center" style={{ background: 'var(--dome-surface)' }}>
              <FolderOpen className="size-8" style={{ color: 'var(--dome-text-muted)', opacity: 0.4 }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{t('folder.emptyFolder')}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--dome-text-muted)' }}>{t('folder.emptyFolderHint')}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleNewNote}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,111,205,0.3)' }}
              >
                <Plus className="size-3.5" />
                {t('toolbar.note', 'Nueva nota')}
              </button>
              <button
                type="button"
                onClick={handleUpload}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: 'var(--dome-surface)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)', cursor: 'pointer' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-accent)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--dome-border)'; }}
              >
                <Upload className="size-3.5" />
                {t('toolbar.import', 'Subir archivo')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Subfolders ── */}
            {(subfolders.length > 0 || creatingFolder) && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('folder.foldersHeading')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {subfolders.map((folder) => (
                    <SubfolderCard
                      key={folder.id}
                      folder={folder}
                      onClick={() => openFolderTab(folder.id, folder.title, getFolderColor(folder))}
                      onRename={(newTitle) => handleSubfolderRename(folder.id, newTitle)}
                      onDelete={() => handleSubfolderDelete(folder.id)}
                      onChangeColor={(color) => handleSubfolderColor(folder.id, color, folder)}
                      onMoveToProject={() => setMoveProjectIds([folder.id])}
                      selected={selectedIds.has(folder.id)}
                      showSelectionChrome={showSelectionChrome}
                      onToggleSelect={(e) => {
                        e.stopPropagation();
                        toggleSelectId(folder.id);
                      }}
                    />
                  ))}
                  {creatingFolder && (
                    <NewFolderInline onConfirm={handleCreateFolder} onCancel={() => setCreatingFolder(false)} />
                  )}
                </div>
              </section>
            )}

            {/* ── Files ── */}
            {files.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('folder.filesHeading')}
                </h2>
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--dome-border)' }}>
                  {files.map((file, idx) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      isLast={idx === files.length - 1}
                      onOpen={() => openResourceTab(file.id, file.type, file.title ?? 'Sin título')}
                      onDelete={() => handleDeleteFile(file.id)}
                      onRename={(newTitle) => handleRenameFile(file.id, newTitle)}
                      onMoveToProject={() => setMoveProjectIds([file.id])}
                      selected={selectedIds.has(file.id)}
                      showSelectionChrome={showSelectionChrome}
                      onToggleSelect={(e) => {
                        e.stopPropagation();
                        toggleSelectId(file.id);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

          </>
        )}

      </div>

      <DomeModal
        open={folderPickOpen}
        onClose={() => setFolderPickOpen(false)}
        title={t('selection.move_to_folder')}
        size="sm"
        footer={
          <DomeButton variant="secondary" onClick={() => setFolderPickOpen(false)}>
            {t('common.cancel')}
          </DomeButton>
        }
      >
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {t('selection.items_selected_other', { count: selectedIds.size })}
          </Text>
          <ScrollArea.Autosize mah={280}>
            <Stack gap={4}>
              <UnstyledButton
                type="button"
                onClick={() => void handleBulkMoveToFolder(null)}
                p="sm"
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--dome-border)',
                  textAlign: 'left',
                  background: 'var(--dome-surface)',
                }}
              >
                <Text size="sm" fw={500}>
                  {t('selection.move_to_root')}
                </Text>
              </UnstyledButton>
              {folderTargetsForMove.map((f) => (
                <UnstyledButton
                  key={f.id}
                  type="button"
                  onClick={() => void handleBulkMoveToFolder(f.id)}
                  p="sm"
                  style={{
                    borderRadius: 8,
                    border: '1px solid var(--dome-border)',
                    textAlign: 'left',
                    background: 'var(--dome-surface)',
                  }}
                >
                  <Text size="sm" fw={500} truncate>
                    {f.title}
                  </Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Stack>
      </DomeModal>

      <MoveToProjectModal
        opened={moveProjectIds.length > 0}
        onClose={() => setMoveProjectIds([])}
        resourceIds={moveProjectIds}
        resourcesById={resourceMapForSelection}
        onCompleted={() => void refetch()}
      />
    </div>
  );
}
