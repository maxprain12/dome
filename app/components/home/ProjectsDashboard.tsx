'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  Folder01Icon,
  GridViewIcon,
  ListViewIcon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { db, type Project, type Resource } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { ProjectCard } from '@/components/home/projects/ProjectCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PageHeader } from '@/components/shared/PageHeader';
import { PageToolbar } from '@/components/shared/PageToolbar';

type DashboardStats = {
  resourceCount: number;
  studioCount: number;
  dueFlashcards: number;
  upcomingEvents: number;
  recentChats: number;
};

type ProjectsDashboardProps = {
  currentProject: Project | null;
  onSelectProject: (project: Project | null) => void;
  onOpenProjectLibrary: () => void;
};

const EMPTY_STATS: DashboardStats = {
  resourceCount: 0,
  studioCount: 0,
  dueFlashcards: 0,
  upcomingEvents: 0,
  recentChats: 0,
};

const DELETE_IMPACT_ORDER = [
  'resources',
  'chatSessions',
  'agents',
  'workflows',
  'automations',
  'runs',
  'flashcardDecks',
  'studioOutputs',
  'agentFolders',
  'workflowFolders',
] as const;

export default function ProjectsDashboard({
  currentProject,
  onSelectProject,
  onOpenProjectLibrary,
}: ProjectsDashboardProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectVaultRoot, setNewProjectVaultRoot] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editTarget, setEditTarget] = useState<Project | null>(null);
  const [editProjectName, setEditProjectName] = useState('');
  const [editProjectDescription, setEditProjectDescription] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Single delete
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteImpact, setDeleteImpact] = useState<Record<string, number> | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteSubmitting, setBulkDeleteSubmitting] = useState(false);

  // KB overrides
  const [kbOverrides, setKbOverrides] = useState<Record<string, 'inherit' | 'enabled' | 'disabled'>>({});

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const scopedProjectId = currentProject?.id ?? 'default';
      const [projectsResult, resourcesResult, eventsResult, chatsResult, decksResult] = await Promise.all([
        db.getProjects(),
        window.electron?.db?.resources?.listLight?.(2000),
        window.electron?.calendar?.getUpcoming?.({ windowMinutes: 60 * 24 * 7, limit: 50 }),
        db.getChatSessionsGlobal({ limit: 100, projectId: scopedProjectId }),
        window.electron?.db?.flashcards?.getAllDecks?.(200),
      ]);

      const nextProjects = projectsResult.success && projectsResult.data ? projectsResult.data : [];
      const nextResources = resourcesResult?.success && resourcesResult.data ? resourcesResult.data : [];
      setProjects(nextProjects);
      setResources(nextResources);

      if (window.electron?.kbllm?.getProjectOverride) {
        const ov: Record<string, 'inherit' | 'enabled' | 'disabled'> = {};
        for (const p of nextProjects) {
          try {
            const r = await window.electron.kbllm.getProjectOverride(p.id);
            const o = r && typeof r === 'object' && 'success' in r && r.success && r.data && typeof r.data === 'object' && 'override' in r.data
              ? (r.data as { override?: string }).override
              : 'inherit';
            ov[p.id] = o === 'enabled' || o === 'disabled' ? o : 'inherit';
          } catch {
            ov[p.id] = 'inherit';
          }
        }
        setKbOverrides(ov);
      }

      const scopedResources = nextResources.filter((resource: Resource) => resource.project_id === scopedProjectId);

      let studioCount = 0;
      if (window.electron?.db?.studio?.getByProject) {
        const studioResult = await window.electron.db.studio.getByProject(scopedProjectId);
        studioCount = studioResult?.success && Array.isArray(studioResult.data) ? studioResult.data.length : 0;
      }

      let dueFlashcards = 0;
      const decks = decksResult?.success && Array.isArray(decksResult.data) ? decksResult.data : [];
      const scopedDecks = decks.filter((deck: { project_id: string }) => deck.project_id === scopedProjectId);
      if (window.electron?.db?.flashcards?.getStats) {
        const deckStats = await Promise.all(
          scopedDecks.map((deck: { id: string }) => window.electron.db.flashcards.getStats(deck.id)),
        );
        dueFlashcards = deckStats.reduce((sum, result) => {
          if (!result?.success || !result.data) return sum;
          return sum + Number(result.data.due_cards || 0) + Number(result.data.new_cards || 0);
        }, 0);
      }

      const recentChats = chatsResult.success && Array.isArray(chatsResult.data) ? chatsResult.data.length : 0;
      const upcomingEvents = eventsResult?.success && Array.isArray(eventsResult.events) ? eventsResult.events.length : 0;

      setStats({
        resourceCount: scopedResources.length,
        studioCount,
        dueFlashcards,
        upcomingEvents,
        recentChats,
      });
    } catch (error) {
      console.error('[ProjectsDashboard] Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [currentProject?.id]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) return;
    const unsubscribeProject = window.electron.on('project:created', () => { void loadProjects(); });
    const unsubscribeProjectUpdated = window.electron.on('project:updated', () => { void loadProjects(); });
    const unsubscribeProjectDeleted = window.electron.on('project:deleted', () => { void loadProjects(); });
    const unsubscribeResource = window.electron.on('resource:created', () => { void loadProjects(); });
    const unsubscribeResourceUpdate = window.electron.on('resource:updated', () => { void loadProjects(); });
    // Refresh learn KPIs (due cards, studio counts) when study activity changes
    const unsubscribeSession = window.electron.on('flashcard:sessionEnded', () => { void loadProjects(); });
    const unsubscribeStudioCreated = window.electron.on('studio:outputCreated', () => { void loadProjects(); });
    const unsubscribeStudioDeleted = window.electron.on('studio:outputDeleted', () => { void loadProjects(); });
    const unsubscribeDeckDeleted = window.electron.on('flashcard:deckDeleted', () => { void loadProjects(); });
    return () => {
      unsubscribeProject?.();
      unsubscribeProjectUpdated?.();
      unsubscribeProjectDeleted?.();
      unsubscribeResource?.();
      unsubscribeResourceUpdate?.();
      unsubscribeSession?.();
      unsubscribeStudioCreated?.();
      unsubscribeStudioDeleted?.();
      unsubscribeDeckDeleted?.();
    };
  }, [loadProjects]);

  // ── Single delete ──────────────────────────────────────────────────────────
  const openDeleteProject = useCallback((project: Project) => {
    if (project.id === 'default') return;
    setDeleteTarget(project);
    setDeleteConfirmName('');
    setDeleteImpact(null);
    setDeleteImpactLoading(true);
    void db.getProjectDeletionImpact(project.id).then((impact) => {
      if (!mountedRef.current) return;
      setDeleteImpact(impact.success && impact.data ? impact.data : null);
      setDeleteImpactLoading(false);
    });
  }, []);

  const executeDeleteProject = useCallback(async () => {
    if (!deleteTarget || deleteConfirmName !== deleteTarget.name) return;
    setDeleteSubmitting(true);
    try {
      const deletedId = deleteTarget.id;
      const result = await db.deleteProjectWithContent(deletedId);
      if (!result.success) {
        showToast('error', result.error ?? t('projects.delete_error'));
        return;
      }
      showToast('success', t('projects.delete_success'));
      setDeleteTarget(null);
      setDeleteConfirmName('');
      setDeleteImpact(null);
      await loadProjects();
      if (currentProject?.id === deletedId) {
        const pr = await db.getProjects();
        const dome = pr.data?.find((p) => p.id === 'default') ?? null;
        onSelectProject(dome);
      }
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteTarget, deleteConfirmName, loadProjects, currentProject?.id, onSelectProject, t]);

  // ── Bulk delete ────────────────────────────────────────────────────────────
  const executeBulkDelete = useCallback(async () => {
    const idsToDelete = [...selectedIds].filter((id) => id !== 'default');
    if (idsToDelete.length === 0) return;
    const currentId = currentProject?.id;
    const currentWasDeleted = Boolean(currentId && idsToDelete.includes(currentId));
    setBulkDeleteSubmitting(true);
    try {
      let anyFailed = false;
      for (const id of idsToDelete) {
        const result = await db.deleteProjectWithContent(id);
        if (!result.success) { anyFailed = true; }
      }
      if (anyFailed) {
        showToast('error', t('projects.delete_error'));
      } else {
        showToast('success', t('projects.delete_success'));
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      setBulkDeleteOpen(false);
      await loadProjects();
      if (currentWasDeleted) {
        const pr = await db.getProjects();
        const dome = pr.data?.find((p) => p.id === 'default') ?? null;
        onSelectProject(dome);
      }
    } finally {
      setBulkDeleteSubmitting(false);
    }
  }, [selectedIds, loadProjects, currentProject?.id, onSelectProject, t]);

  // ── Create ─────────────────────────────────────────────────────────────────
  const domeProject = useMemo(() => projects.find((p) => p.id === 'default') ?? null, [projects]);

  const resetCreateForm = useCallback(() => {
    setShowCreateForm(false);
    setNewProjectName('');
    setNewProjectDescription('');
    setNewProjectVaultRoot('');
  }, []);

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await db.createProject({ name, description: newProjectDescription.trim() || undefined });
      if (!result.success || !result.data) throw new Error(result.error || t('projects.create_error'));
      // Optional: point the new project at a custom Markdown vault folder.
      if (newProjectVaultRoot.trim()) {
        try {
          await window.electron?.db?.projects?.setVaultRoot?.({ projectId: result.data.id, vaultRoot: newProjectVaultRoot.trim() });
        } catch { /* non-fatal */ }
      }
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectVaultRoot('');
      setShowCreateForm(false);
      onSelectProject(result.data);
      showToast('success', t('projects.created'));
      await loadProjects();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : t('toast.project_create_error'));
    } finally {
      setCreating(false);
    }
  }, [loadProjects, newProjectDescription, newProjectName, newProjectVaultRoot, onSelectProject, t]);

  const openEditProject = useCallback((project: Project) => {
    setEditTarget(project);
    setEditProjectName(project.name);
    setEditProjectDescription(project.description ?? '');
  }, []);

  const handleEditProject = useCallback(async () => {
    if (!editTarget || !editProjectName.trim()) return;
    setEditSubmitting(true);
    try {
      const result = await db.updateProject({
        id: editTarget.id,
        name: editProjectName.trim(),
        description: editProjectDescription.trim() || undefined,
      });
      if (!result.success || !result.data) {
        showToast('error', result.error ?? t('projects.create_error'));
        return;
      }
      if (currentProject?.id === result.data.id) onSelectProject(result.data);
      setEditTarget(null);
      showToast('success', t('common.saved', 'Guardado'));
      await loadProjects();
    } finally {
      setEditSubmitting(false);
    }
  }, [currentProject?.id, editProjectDescription, editProjectName, editTarget, loadProjects, onSelectProject, t]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    if (id === 'default') return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectableProjects = useMemo(() => projects.filter((p) => p.id !== 'default'), [projects]);
  const allSelected = selectableProjects.length > 0 && selectableProjects.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableProjects.map((p) => p.id)));
    }
  }, [allSelected, selectableProjects]);

  const resourceCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const resource of resources) {
      map.set(resource.project_id, (map.get(resource.project_id) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLocaleLowerCase();
    if (!query) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.description ?? ''}`.toLocaleLowerCase().includes(query),
    );
  }, [projectQuery, projects]);

  const pulseCells = [
    { key: 'resources', value: stats.resourceCount, labelKey: 'projects.resources' },
    { key: 'studio', value: stats.studioCount, labelKey: 'projects.studio' },
    { key: 'cards', value: stats.dueFlashcards, labelKey: 'projects.flashcards' },
    { key: 'agenda', value: stats.upcomingEvents, labelKey: 'projects.agenda_7d' },
    { key: 'chats', value: stats.recentChats, labelKey: 'projects.chats' },
  ] as const;

  const handleKbOverride = useCallback(
    async (projectId: string, val: 'inherit' | 'enabled' | 'disabled') => {
      try {
        const r = await window.electron?.kbllm?.setProjectOverride?.({ projectId, override: val });
        const ok = r && typeof r === 'object' && 'success' in r && (r as { success?: boolean }).success;
        if (ok) setKbOverrides((prev) => ({ ...prev, [projectId]: val }));
        else showToast('error', t('settings.kb_llm.error_save'));
      } catch {
        showToast('error', t('settings.kb_llm.error_save'));
      }
    },
    [t],
  );

  return (
    <>
      <main className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
          <PageHeader
            title={t('projects.title')}
            description={currentProject ? t('projects.active_project', { name: currentProject.name }) : t('projects.subtitle')}
            eyebrow={t('projects.workspaces_count', { count: projects.length })}
            actions={
              <>
                {domeProject && currentProject?.id !== 'default' ? (
                  <Button type="button" variant="outline" onClick={() => onSelectProject(domeProject)}>
                    <HugeiconsIcon icon={Folder01Icon} data-icon="inline-start" />
                    {t('projects.switch_to_dome')}
                  </Button>
                ) : null}
                <Button type="button" onClick={() => setShowCreateForm(true)}>
                  <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
                  {t('projects.create_project')}
                </Button>
              </>
            }
          />

          <section aria-label={t('dashboard.section_pulse')} className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {pulseCells.map((cell) => (
              <Card key={cell.key} size="sm" className="shadow-sm">
                <CardContent className="flex flex-col gap-1">
                  {loading ? <Skeleton className="h-7 w-10" /> : <span className="text-2xl font-semibold tabular-nums">{cell.value}</span>}
                  <span className="text-xs text-muted-foreground">{t(cell.labelKey)}</span>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="flex flex-col gap-4" aria-labelledby="projects-list-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="projects-list-heading" className="font-heading text-lg font-semibold">{t('projects.your_projects')}</h2>
                <p className="text-sm text-muted-foreground">{t('projects.new_project_desc')}</p>
              </div>
              <Button type="button" variant="ghost" onClick={onOpenProjectLibrary}>{t('projects.open_library')}</Button>
            </div>
            <PageToolbar
              separated={false}
              primary={
                <InputGroup className="max-w-md">
                  <InputGroupAddon><HugeiconsIcon icon={Search01Icon} /></InputGroupAddon>
                  <InputGroupInput
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder={t('common.search', 'Buscar proyectos')}
                    aria-label={t('common.search', 'Buscar proyectos')}
                  />
                </InputGroup>
              }
              secondary={
                <>
                  {selectionMode ? (
                    <>
                      <Button type="button" variant="outline" onClick={toggleSelectAll}>
                        {allSelected ? t('common.deselect_all') : t('common.select_all')}
                      </Button>
                      <Button type="button" variant="destructive" disabled={selectedIds.size === 0} onClick={() => setBulkDeleteOpen(true)}>
                        <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
                        {t('common.delete')} ({selectedIds.size})
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : selectableProjects.length ? (
                    <Button type="button" variant="outline" onClick={() => setSelectionMode(true)}>{t('common.select')}</Button>
                  ) : null}
                  <ToggleGroup value={[viewMode]} onValueChange={(value) => { const next = value[0]; if (next === 'grid' || next === 'list') setViewMode(next); }} variant="outline" spacing={0} aria-label={t('projects.title')}>
                    <ToggleGroupItem value="grid" aria-label="Grid"><HugeiconsIcon icon={GridViewIcon} /></ToggleGroupItem>
                    <ToggleGroupItem value="list" aria-label="List"><HugeiconsIcon icon={ListViewIcon} /></ToggleGroupItem>
                  </ToggleGroup>
                </>
              }
            />

            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-44" />)}
              </div>
            ) : filteredProjects.length === 0 ? (
              <Card className="items-center py-12 text-center shadow-sm">
                <CardContent className="flex flex-col items-center gap-3">
                  <HugeiconsIcon icon={Folder01Icon} className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{projectQuery ? t('command.no_results', { query: projectQuery }) : t('projects.empty')}</p>
                  {!projectQuery ? <Button type="button" onClick={() => setShowCreateForm(true)}>{t('projects.create_project')}</Button> : null}
                </CardContent>
              </Card>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-3'}>
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    resourceCount={resourceCountByProject.get(project.id) ?? 0}
                    isActive={currentProject?.id === project.id}
                    isSelected={selectedIds.has(project.id)}
                    isDome={project.id === 'default'}
                    selectionMode={selectionMode}
                    kbOverride={kbOverrides[project.id] ?? 'inherit'}
                    kbMenuOpen={false}
                    onSelect={() => onSelectProject(project)}
                    onToggleSelect={() => toggleSelect(project.id)}
                    onKbMenuToggle={() => undefined}
                    onKbOverrideChange={(value) => void handleKbOverride(project.id, value)}
                    onEdit={() => openEditProject(project)}
                    onDelete={() => openDeleteProject(project)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Dialog open={showCreateForm} onOpenChange={(open) => { if (!open) resetCreateForm(); else setShowCreateForm(true); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('projects.new_project')}</DialogTitle>
            <DialogDescription>{t('projects.new_project_desc')}</DialogDescription>
          </DialogHeader>
          <form className="contents" onSubmit={(event) => { event.preventDefault(); void handleCreateProject(); }}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-project-name">{t('projects.project_name')}</FieldLabel>
                <Input id="new-project-name" value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder={t('projects.project_name_placeholder')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-project-description">{t('projects.brief_description')}</FieldLabel>
                <Textarea id="new-project-description" value={newProjectDescription} onChange={(event) => setNewProjectDescription(event.target.value)} placeholder={t('projects.brief_description_placeholder')} />
              </Field>
              <Field>
                <FieldLabel>{t('projects.vault_folder_label')}</FieldLabel>
                <FieldDescription className="truncate">{newProjectVaultRoot || t('projects.vault_default_hint')}</FieldDescription>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={async () => { const dir = await window.electron?.selectFolder?.(); if (dir) setNewProjectVaultRoot(dir); }}>
                    <HugeiconsIcon icon={Folder01Icon} data-icon="inline-start" />
                    {newProjectVaultRoot ? t('projects.vault_change_folder') : t('projects.choose_vault_folder')}
                  </Button>
                  {newProjectVaultRoot ? <Button type="button" variant="ghost" onClick={() => setNewProjectVaultRoot('')}>{t('projects.vault_use_default')}</Button> : null}
                </div>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetCreateForm}>{t('common.cancel')}</Button>
              <Button type="submit" loading={creating} disabled={!newProjectName.trim()}>{t('projects.create_project')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('common.edit', 'Editar')} {editTarget?.name}</DialogTitle>
            <DialogDescription>{t('projects.new_project_desc')}</DialogDescription>
          </DialogHeader>
          <form className="contents" onSubmit={(event) => { event.preventDefault(); void handleEditProject(); }}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-project-name">{t('projects.project_name')}</FieldLabel>
                <Input id="edit-project-name" value={editProjectName} onChange={(event) => setEditProjectName(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-project-description">{t('projects.brief_description')}</FieldLabel>
                <Textarea id="edit-project-description" value={editProjectDescription} onChange={(event) => setEditProjectDescription(event.target.value)} />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
              <Button type="submit" loading={editSubmitting} disabled={!editProjectName.trim()}>{t('common.save', 'Guardar')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.delete_critical_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('projects.delete_critical_warning')} <strong>{deleteTarget?.name}</strong></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
            {deleteImpactLoading ? <Skeleton className="h-16" /> : (
              <ul className="flex flex-col gap-1">
                {DELETE_IMPACT_ORDER.map((key) => {
                  const count = deleteImpact?.[key] ?? 0;
                  return count > 0 ? <li key={key}>{t(`projects.delete_impact_${key}` as 'projects.delete_impact_resources')}: <span className="tabular-nums">{count}</span></li> : null;
                })}
              </ul>
            )}
          </div>
          <Field data-invalid={Boolean(deleteConfirmName && deleteConfirmName !== deleteTarget?.name)}>
            <FieldLabel htmlFor="delete-project-confirm-input">{t('projects.delete_confirm_prompt')}</FieldLabel>
            <Input id="delete-project-confirm-input" value={deleteConfirmName} onChange={(event) => setDeleteConfirmName(event.target.value)} placeholder={t('projects.delete_confirm_placeholder')} autoComplete="off" />
            {deleteConfirmName && deleteConfirmName !== deleteTarget?.name ? <FieldDescription>{t('projects.delete_confirm_mismatch')}</FieldDescription> : null}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={deleteSubmitting} disabled={deleteImpactLoading || deleteConfirmName !== deleteTarget?.name} onClick={() => void executeDeleteProject()}>
              {t('projects.delete_execute')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects.delete_critical_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('projects.delete_critical_warning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
            {projects.filter((project) => selectedIds.has(project.id) && project.id !== 'default').map((project) => <Badge key={project.id} variant="outline">{project.name}</Badge>)}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteSubmitting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" loading={bulkDeleteSubmitting} onClick={() => void executeBulkDelete()}>{t('projects.delete_execute')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
