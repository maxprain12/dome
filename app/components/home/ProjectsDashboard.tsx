'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Layers3, Plus, Sparkles, WalletCards, MessageCircle, Trash2 } from 'lucide-react';
import { db, type Project, type Resource } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';

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
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteImpact, setDeleteImpact] = useState<Record<string, number> | null>(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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

      const recentChats =
        chatsResult.success && Array.isArray(chatsResult.data) ? chatsResult.data.length : 0;

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

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron?.on) {
      return;
    }
    const unsubscribeProject = window.electron.on('project:created', () => {
      void loadProjects();
    });
    const unsubscribeProjectDeleted = window.electron.on('project:deleted', () => {
      void loadProjects();
    });
    const unsubscribeResource = window.electron.on('resource:created', () => {
      void loadProjects();
    });
    const unsubscribeResourceUpdate = window.electron.on('resource:updated', () => {
      void loadProjects();
    });
    return () => {
      unsubscribeProject?.();
      unsubscribeProjectDeleted?.();
      unsubscribeResource?.();
      unsubscribeResourceUpdate?.();
    };
  }, [loadProjects]);

  const openDeleteProject = useCallback((project: Project) => {
    if (project.id === 'default') return;
    setDeleteTarget(project);
    setDeleteConfirmName('');
    setDeleteImpact(null);
    setDeleteImpactLoading(true);
    void db.getProjectDeletionImpact(project.id).then((impact) => {
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

  const domeProject = useMemo(() => projects.find((p) => p.id === 'default') ?? null, [projects]);

  const handleCreateProject = useCallback(async () => {
    const name = newProjectName.trim();
    if (!name) {
      return;
    }
    setCreating(true);
    try {
      const result = await db.createProject({
        name,
        description: newProjectDescription.trim() || undefined,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error || t('projects.create_error'));
      }
      setNewProjectName('');
      setNewProjectDescription('');
      onSelectProject(result.data);
      showToast('success', t('projects.created'));
      await loadProjects();
    } catch (error) {
      console.error('[ProjectsDashboard] Error creating project:', error);
      showToast('error', error instanceof Error ? error.message : t('toast.project_create_error'));
    } finally {
      setCreating(false);
    }
  }, [loadProjects, newProjectDescription, newProjectName, onSelectProject, t]);

  const cards = [
    { label: t('projects.resources'), value: stats.resourceCount, icon: Layers3 },
    { label: t('projects.studio'), value: stats.studioCount, icon: Sparkles },
    { label: t('projects.flashcards'), value: stats.dueFlashcards, icon: WalletCards },
    { label: t('projects.agenda_7d'), value: stats.upcomingEvents, icon: CalendarDays },
    { label: t('projects.chats'), value: stats.recentChats, icon: MessageCircle },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold text-[var(--dome-text)]">{t('projects.title')}</h2>
              <p className="mt-1 text-sm text-[var(--dome-text-muted)]">
                {t('projects.subtitle')}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => domeProject && onSelectProject(domeProject)}
                disabled={!domeProject}
                className="rounded-lg border px-3 py-2 text-sm text-[var(--dome-text-muted)] hover:bg-[var(--dome-surface)] disabled:opacity-50"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {t('projects.switch_to_dome')}
              </button>
              <button
                type="button"
                onClick={onOpenProjectLibrary}
                className="rounded-lg bg-[var(--dome-accent)] px-3 py-2 text-sm font-medium text-[var(--dome-accent-fg)]"
              >
                {t('projects.open_library')}
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border p-4"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.14em] text-[var(--dome-text-muted)]">{card.label}</p>
                      <p className="mt-2 text-3xl font-semibold text-[var(--dome-text)]">{card.value}</p>
                    </div>
                    <div className="rounded-xl bg-[var(--dome-bg)] p-3 text-[var(--dome-accent)]">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section
              className="rounded-2xl border p-5"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--dome-text)]">{t('projects.your_projects')}</h3>
                  <p className="text-sm text-[var(--dome-text-muted)]">
                    {t('projects.active_project', { name: currentProject?.name ?? 'Dome' })}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--dome-text-muted)]" style={{ borderColor: 'var(--dome-border)' }}>
                    {t('projects.loading')}
                  </div>
                ) : projects.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-[var(--dome-text-muted)]" style={{ borderColor: 'var(--dome-border)' }}>
                    {t('projects.empty')}
                  </div>
                ) : (
                  projects.map((project) => {
                    const projectResources = resources.filter((resource) => resource.project_id === project.id);
                    const isActive = currentProject?.id === project.id;
                    return (
                      <div
                        key={project.id}
                        className="flex w-full items-stretch gap-2 rounded-xl border transition-colors hover:bg-[var(--dome-bg)]"
                        style={{
                          borderColor: isActive ? 'var(--dome-accent)' : 'var(--dome-border)',
                          background: isActive ? 'color-mix(in srgb, var(--dome-accent) 10%, var(--dome-surface))' : 'transparent',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectProject(project)}
                          className="flex flex-1 min-w-0 items-center justify-between rounded-xl p-4 text-left"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--dome-text)]">{project.name}</p>
                            <p className="mt-1 text-sm text-[var(--dome-text-muted)]">
                              {project.description?.trim() || t('projects.no_description')}
                            </p>
                            <p className="mt-2 text-xs text-[var(--dome-text-muted)]">
                              {projectResources.length} {t('projects.resource', { count: projectResources.length })}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--dome-text-muted)]" />
                        </button>
                        {project.id !== 'default' ? (
                          <button
                            type="button"
                            title={t('projects.delete_project')}
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteProject(project);
                            }}
                            className="shrink-0 self-stretch px-3 rounded-r-xl border-l transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-error, #ef4444)', background: 'transparent', cursor: 'pointer' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section
              className="rounded-2xl border p-5"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
            >
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-[var(--dome-text)]">{t('projects.new_project')}</h3>
                <p className="text-sm text-[var(--dome-text-muted)]">
                  {t('projects.new_project_desc')}
                </p>
              </div>

              <div className="space-y-3">
                <input
                  value={newProjectName}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  placeholder={t('projects.project_name')}
                  className="w-full rounded-xl border bg-[var(--dome-bg)] px-3 py-2 text-sm text-[var(--dome-text)] outline-none"
                  style={{ borderColor: 'var(--dome-border)' }}
                />
                <textarea
                  value={newProjectDescription}
                  onChange={(event) => setNewProjectDescription(event.target.value)}
                  placeholder={t('projects.brief_description')}
                  rows={4}
                  className="w-full resize-none rounded-xl border bg-[var(--dome-bg)] px-3 py-2 text-sm text-[var(--dome-text)] outline-none"
                  style={{ borderColor: 'var(--dome-border)' }}
                />
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  disabled={creating || !newProjectName.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--dome-accent)] px-4 py-2 text-sm font-medium text-[var(--dome-accent-fg)] disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  {creating ? t('projects.creating') : t('projects.create_project')}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border p-5 shadow-xl"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
          >
            <h3 id="delete-project-title" className="text-lg font-semibold text-[var(--dome-text)]">
              {t('projects.delete_critical_title')}
            </h3>
            <p className="mt-2 text-sm text-[var(--dome-error, #ef4444)] font-medium">
              {t('projects.delete_critical_warning')}
            </p>
            <p className="mt-3 text-sm font-medium text-[var(--dome-text)]">{deleteTarget.name}</p>

            <div className="mt-4 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: 'var(--dome-border)' }}>
              {deleteImpactLoading ? (
                <p className="text-[var(--dome-text-muted)]">{t('projects.loading')}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4 text-[var(--dome-text-muted)]">
                  {DELETE_IMPACT_ORDER.map((key) => {
                    const n = deleteImpact?.[key] ?? 0;
                    if (n <= 0) return null;
                    return (
                      <li key={key}>
                        {t(`projects.delete_impact_${key}` as 'projects.delete_impact_resources')}:{' '}
                        <span className="tabular-nums text-[var(--dome-text)]">{n}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="mt-4 block text-sm text-[var(--dome-text)]" htmlFor="delete-project-confirm-input">
              {t('projects.delete_confirm_prompt')}
            </label>
            <input
              id="delete-project-confirm-input"
              autoComplete="off"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={t('projects.delete_confirm_placeholder')}
              className="mt-2 w-full rounded-xl border bg-[var(--dome-bg)] px-3 py-2 text-sm text-[var(--dome-text)] outline-none"
              style={{ borderColor: 'var(--dome-border)' }}
            />
            {deleteConfirmName && deleteConfirmName !== deleteTarget.name ? (
              <p className="mt-2 text-xs text-[var(--dome-error, #ef4444)]">{t('projects.delete_confirm_mismatch')}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmName('');
                  setDeleteImpact(null);
                }}
                className="rounded-xl border px-4 py-2 text-sm text-[var(--dome-text-muted)]"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={
                  deleteSubmitting ||
                  deleteImpactLoading ||
                  deleteConfirmName !== deleteTarget.name
                }
                onClick={() => void executeDeleteProject()}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--dome-error, #ef4444)' }}
              >
                {deleteSubmitting ? t('projects.delete_deleting') : t('projects.delete_execute')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
