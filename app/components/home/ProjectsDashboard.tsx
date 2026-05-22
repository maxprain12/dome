'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { db, type Project, type Resource } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';
import { HomeSectionHeader } from '@/components/home/dashboard/editorial/HomeSectionHeader';
import { ProjectsHero } from '@/components/home/projects/ProjectsHero';
import { ProjectCard } from '@/components/home/projects/ProjectCard';

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
  const [showCreateForm, setShowCreateForm] = useState(false);

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
  const [kbMenuFor, setKbMenuFor] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const scopedProjectId = currentProject?.id ?? 'default';
      const [projectsResult, resourcesResult, eventsResult, chatsResult, decksResult] = await Promise.all([
        db.getProjects(),
        window.electron?.db?.resources?.getAll?.(2000),
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
          const dueCards = result?.success ? Number(result.data?.due_cards || 0) : 0;
          return sum + dueCards;
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
    const unsubscribeProjectDeleted = window.electron.on('project:deleted', () => { void loadProjects(); });
    const unsubscribeResource = window.electron.on('resource:created', () => { void loadProjects(); });
    const unsubscribeResourceUpdate = window.electron.on('resource:updated', () => { void loadProjects(); });
    return () => {
      unsubscribeProject?.();
      unsubscribeProjectDeleted?.();
      unsubscribeResource?.();
      unsubscribeResourceUpdate?.();
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

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await db.createProject({ name, description: newProjectDescription.trim() || undefined });
      if (!result.success || !result.data) throw new Error(result.error || t('projects.create_error'));
      setNewProjectName('');
      setNewProjectDescription('');
      setShowCreateForm(false);
      onSelectProject(result.data);
      showToast('success', t('projects.created'));
      await loadProjects();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : t('toast.project_create_error'));
    } finally {
      setCreating(false);
    }
  }, [loadProjects, newProjectDescription, newProjectName, onSelectProject, t]);

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

  const pulseCells = [
    { key: 'resources', value: stats.resourceCount, labelKey: 'projects.resources' },
    { key: 'studio', value: stats.studioCount, labelKey: 'projects.studio' },
    { key: 'cards', value: stats.dueFlashcards, labelKey: 'projects.flashcards' },
    { key: 'agenda', value: stats.upcomingEvents, labelKey: 'projects.agenda_7d' },
    { key: 'chats', value: stats.recentChats, labelKey: 'projects.chats' },
  ] as const;

  const handleKbOverride = useCallback(
    async (projectId: string, val: 'inherit' | 'enabled' | 'disabled') => {
      setKbMenuFor(null);
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
      <div className="home-shell">
        <div className="home-scroll">
          <div className="home-canvas">
            <ProjectsHero
              projectCount={projects.length}
              currentProject={currentProject}
              activeResourceCount={stats.resourceCount}
              selectionMode={selectionMode}
              selectableCount={selectableProjects.length}
              selectedCount={selectedIds.size}
              allSelected={allSelected}
              onSwitchToDome={() => domeProject && onSelectProject(domeProject)}
              onToggleSelectMode={() => setSelectionMode(true)}
              onToggleSelectAll={toggleSelectAll}
              onBulkDelete={() => setBulkDeleteOpen(true)}
              onCancelSelection={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              onCreateClick={() => setShowCreateForm((v) => !v)}
              canSwitchToDome={Boolean(domeProject) && currentProject?.id !== 'default'}
            />

            <section className="p-projects-section">
              <HomeSectionHeader title={t('dashboard.section_pulse')} />
              <div className="h-stats">
                {pulseCells.map((cell) => (
                  <div key={cell.key} className="cell">
                    {loading ? (
                      <span className="v">—</span>
                    ) : (
                      <span className="v">{cell.value}</span>
                    )}
                    <span className="k">{t(cell.labelKey)}</span>
                  </div>
                ))}
              </div>
            </section>

            {showCreateForm ? (
              <div className="h-card p-projects-create">
                <h3 className="h-card-title">{t('projects.new_project')}</h3>
                <p className="p-projects-create-desc">{t('projects.new_project_desc')}</p>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={t('projects.project_name')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) void handleCreateProject();
                  }}
                  className="p-projects-field"
                />
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder={t('projects.brief_description')}
                  rows={2}
                  className="p-projects-field p-projects-field-area"
                  style={{ marginTop: 10 }}
                />
                <div className="p-projects-create-actions">
                  <button
                    type="button"
                    className="h-pill-btn"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewProjectName('');
                      setNewProjectDescription('');
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="h-pill-btn primary"
                    onClick={() => void handleCreateProject()}
                    disabled={creating || !newProjectName.trim()}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                    {creating ? t('projects.creating') : t('projects.create_project')}
                  </button>
                </div>
              </div>
            ) : null}

            <section>
              <HomeSectionHeader
                title={t('projects.your_projects')}
                linkLabel={t('projects.open_library')}
                onLinkClick={onOpenProjectLibrary}
              />

              {loading ? (
                <div className="p-projects-skeleton">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="p-projects-empty">
                  <p>{t('projects.empty')}</p>
                  <button
                    type="button"
                    className="h-pill-btn primary"
                    style={{ marginTop: 14 }}
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus size={13} strokeWidth={2} aria-hidden />
                    {t('projects.create_project')}
                  </button>
                </div>
              ) : (
                <div className="p-projects-grid">
                  {projects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      resourceCount={resourceCountByProject.get(project.id) ?? 0}
                      isActive={currentProject?.id === project.id}
                      isSelected={selectedIds.has(project.id)}
                      isDome={project.id === 'default'}
                      selectionMode={selectionMode}
                      kbOverride={kbOverrides[project.id] ?? 'inherit'}
                      kbMenuOpen={kbMenuFor === project.id}
                      onSelect={() => onSelectProject(project)}
                      onToggleSelect={() => toggleSelect(project.id)}
                      onKbMenuToggle={() =>
                        setKbMenuFor(kbMenuFor === project.id ? null : project.id)
                      }
                      onKbOverrideChange={(val) => void handleKbOverride(project.id, val)}
                      onDelete={() => openDeleteProject(project)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {kbMenuFor !== null ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default border-0 p-0"
          style={{ background: 'transparent' }}
          aria-label={t('common.close')}
          onClick={() => setKbMenuFor(null)}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
        >
          <div className="p-projects-modal">
            <h3 id="delete-project-title" className="p-projects-modal-title">
              {t('projects.delete_critical_title')}
            </h3>
            <p className="p-projects-modal-warning">{t('projects.delete_critical_warning')}</p>
            <p className="p-projects-modal-body">
              <strong style={{ color: 'var(--home-ink)' }}>{deleteTarget.name}</strong>
            </p>

            <div
              className="p-projects-modal-body"
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                border: '1px dashed var(--home-edge)',
              }}
            >
              {deleteImpactLoading ? (
                <p>{t('projects.loading')}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4">
                  {DELETE_IMPACT_ORDER.map((key) => {
                    const n = deleteImpact?.[key] ?? 0;
                    if (n <= 0) return null;
                    return (
                      <li key={key}>
                        {t(`projects.delete_impact_${key}` as 'projects.delete_impact_resources')}:{' '}
                        <span className="tabular-nums">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="p-projects-modal-body block" htmlFor="delete-project-confirm-input">
              {t('projects.delete_confirm_prompt')}
            </label>
            <input
              id="delete-project-confirm-input"
              autoComplete="off"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={t('projects.delete_confirm_placeholder')}
              className="p-projects-field"
              style={{ marginTop: 8 }}
            />
            {deleteConfirmName && deleteConfirmName !== deleteTarget.name ? (
              <p className="p-projects-modal-warning" style={{ marginTop: 8, fontSize: 12 }}>
                {t('projects.delete_confirm_mismatch')}
              </p>
            ) : null}

            <div className="p-projects-modal-actions">
              <button
                type="button"
                className="h-pill-btn"
                disabled={deleteSubmitting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmName('');
                  setDeleteImpact(null);
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="h-pill-btn primary"
                disabled={
                  deleteSubmitting || deleteImpactLoading || deleteConfirmName !== deleteTarget.name
                }
                onClick={() => void executeDeleteProject()}
                style={{
                  background: 'var(--home-rose)',
                  borderColor: 'var(--home-rose)',
                }}
              >
                {deleteSubmitting ? t('projects.delete_deleting') : t('projects.delete_execute')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkDeleteOpen ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="p-projects-modal">
            <h3 className="p-projects-modal-title">{t('projects.delete_critical_title')}</h3>
            <p className="p-projects-modal-body">{t('projects.delete_critical_warning')}</p>
            <ul className="p-projects-modal-body max-h-40 overflow-y-auto space-y-1">
              {[...selectedIds]
                .filter((id) => id !== 'default')
                .map((id) => {
                  const p = projects.find((x) => x.id === id);
                  return p ? (
                    <li
                      key={id}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'var(--home-surface-2)',
                      }}
                    >
                      {p.name}
                    </li>
                  ) : null;
                })}
            </ul>
            <div className="p-projects-modal-actions">
              <button
                type="button"
                className="h-pill-btn"
                disabled={bulkDeleteSubmitting}
                onClick={() => setBulkDeleteOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="h-pill-btn primary"
                disabled={bulkDeleteSubmitting}
                onClick={() => void executeBulkDelete()}
                style={{
                  background: 'var(--home-rose)',
                  borderColor: 'var(--home-rose)',
                }}
              >
                {bulkDeleteSubmitting ? t('projects.delete_deleting') : t('projects.delete_execute')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
