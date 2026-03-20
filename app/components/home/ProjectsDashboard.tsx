'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, FolderOpen, Layers3, Plus, Sparkles, WalletCards, MessageCircle } from 'lucide-react';
import { db, type Project, type Resource } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { useTranslation } from 'react-i18next';

type DashboardStats = {
  resourceCount: number;
  noteCount: number;
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
  noteCount: 0,
  studioCount: 0,
  dueFlashcards: 0,
  upcomingEvents: 0,
  recentChats: 0,
};

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

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsResult, resourcesResult, eventsResult, chatsResult, decksResult] = await Promise.all([
        db.getProjects(),
        window.electron?.db?.resources?.getAll?.(2000),
        window.electron?.calendar?.getUpcoming?.({ windowMinutes: 60 * 24 * 7, limit: 50 }),
        db.getChatSessionsGlobal(100),
        window.electron?.db?.flashcards?.getAllDecks?.(200),
      ]);

      const nextProjects = projectsResult.success && projectsResult.data ? projectsResult.data : [];
      const nextResources = resourcesResult?.success && resourcesResult.data ? resourcesResult.data : [];
      setProjects(nextProjects);
      setResources(nextResources);

      const scopedProjectId = currentProject?.id ?? null;
      const scopedResources = scopedProjectId
        ? nextResources.filter((resource: Resource) => resource.project_id === scopedProjectId)
        : nextResources;

      let studioCount = 0;
      if (scopedProjectId && window.electron?.db?.studio?.getByProject) {
        const studioResult = await window.electron.db.studio.getByProject(scopedProjectId);
        studioCount = studioResult?.success && Array.isArray(studioResult.data) ? studioResult.data.length : 0;
      } else if (!scopedProjectId && window.electron?.db?.studio?.getByProject) {
        const studioResults = await Promise.all(
          nextProjects.map((project) => window.electron.db.studio.getByProject(project.id)),
        );
        studioCount = studioResults.reduce((sum, result) => {
          return sum + (result?.success && Array.isArray(result.data) ? result.data.length : 0);
        }, 0);
      }

      let dueFlashcards = 0;
      const decks = decksResult?.success && Array.isArray(decksResult.data) ? decksResult.data : [];
      const scopedDecks = scopedProjectId ? decks.filter((deck: { project_id: string }) => deck.project_id === scopedProjectId) : decks;
      if (window.electron?.db?.flashcards?.getStats) {
        const deckStats = await Promise.all(
          scopedDecks.map((deck: { id: string }) => window.electron.db.flashcards.getStats(deck.id)),
        );
        dueFlashcards = deckStats.reduce((sum, result) => {
          const dueCards = result?.success ? Number(result.data?.due_cards || 0) : 0;
          return sum + dueCards;
        }, 0);
      }

      const recentChats = chatsResult.success && Array.isArray(chatsResult.data)
        ? chatsResult.data.filter((session) => {
            if (!scopedProjectId) {
              return true;
            }
            const linkedResource = nextResources.find((resource: Resource) => resource.id === session.resource_id);
            return linkedResource?.project_id === scopedProjectId;
          }).length
        : 0;

      const upcomingEvents = eventsResult?.success && Array.isArray(eventsResult.events) ? eventsResult.events.length : 0;

      setStats({
        resourceCount: scopedResources.length,
        noteCount: scopedResources.filter((resource: Resource) => resource.type === 'note').length,
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
    const unsubscribeResource = window.electron.on('resource:created', () => {
      void loadProjects();
    });
    const unsubscribeResourceUpdate = window.electron.on('resource:updated', () => {
      void loadProjects();
    });
    return () => {
      unsubscribeProject?.();
      unsubscribeResource?.();
      unsubscribeResourceUpdate?.();
    };
  }, [loadProjects]);

  const selectedProjectStats = useMemo(() => {
    if (!currentProject) {
      return stats;
    }
    const projectResources = resources.filter((resource) => resource.project_id === currentProject.id);
    return {
      ...stats,
      resourceCount: projectResources.length,
      noteCount: projectResources.filter((resource) => resource.type === 'note').length,
    };
  }, [currentProject, resources, stats]);

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
    { label: t('projects.resources'), value: selectedProjectStats.resourceCount, icon: Layers3 },
    { label: t('projects.notes'), value: selectedProjectStats.noteCount, icon: FolderOpen },
    { label: t('projects.studio'), value: selectedProjectStats.studioCount, icon: Sparkles },
    { label: t('projects.flashcards'), value: selectedProjectStats.dueFlashcards, icon: WalletCards },
    { label: t('projects.agenda_7d'), value: selectedProjectStats.upcomingEvents, icon: CalendarDays },
    { label: t('projects.chats'), value: selectedProjectStats.recentChats, icon: MessageCircle },
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
                onClick={() => onSelectProject(null)}
                className="rounded-lg border px-3 py-2 text-sm text-[var(--dome-text-muted)] hover:bg-[var(--dome-surface)]"
                style={{ borderColor: 'var(--dome-border)' }}
              >
                {t('projects.view_all')}
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
                    {currentProject ? t('projects.active_project', { name: currentProject.name }) : t('projects.no_filter')}
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
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onSelectProject(project)}
                        className="flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors hover:bg-[var(--dome-bg)]"
                        style={{
                          borderColor: isActive ? 'var(--dome-accent)' : 'var(--dome-border)',
                          background: isActive ? 'color-mix(in srgb, var(--dome-accent) 10%, var(--dome-surface))' : 'transparent',
                        }}
                      >
                        <div>
                          <p className="font-medium text-[var(--dome-text)]">{project.name}</p>
                          <p className="mt-1 text-sm text-[var(--dome-text-muted)]">
                            {project.description?.trim() || t('projects.no_description')}
                          </p>
                          <p className="mt-2 text-xs text-[var(--dome-text-muted)]">
                            {projectResources.length} {t('projects.resource', { count: projectResources.length })}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-[var(--dome-text-muted)]" />
                      </button>
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
    </div>
  );
}
