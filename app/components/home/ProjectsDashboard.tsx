'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CalendarDays, Layers3, Plus, Sparkles, WalletCards,
  MessageCircle, Trash2, Check, FolderOpen,
  ChevronDown, Brain,
} from 'lucide-react';
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

function KbBadge({ value }: { value: 'inherit' | 'enabled' | 'disabled' }) {
  const { t } = useTranslation();
  if (value === 'enabled') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)', color: 'var(--dome-accent)' }}>
      <Brain className="w-2.5 h-2.5" /> {t('projects.kb_llm_on')}
    </span>
  );
  if (value === 'disabled') return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
      style={{ background: 'color-mix(in srgb, var(--dome-error) 10%, transparent)', color: 'var(--dome-text-muted)' }}>
      {t('projects.kb_llm_off')}
    </span>
  );
  return null;
}

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

  const cards = [
    { label: t('projects.resources'), value: stats.resourceCount, icon: Layers3, color: 'var(--dome-accent)' },
    { label: t('projects.studio'), value: stats.studioCount, icon: Sparkles, color: 'var(--warning)' },
    { label: t('projects.flashcards'), value: stats.dueFlashcards, icon: WalletCards, color: 'var(--success)' },
    { label: t('projects.agenda_7d'), value: stats.upcomingEvents, icon: CalendarDays, color: 'var(--info)' },
    { label: t('projects.chats'), value: stats.recentChats, icon: MessageCircle, color: 'var(--secondary)' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-7">

          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold" style={{ color: 'var(--dome-text)' }}>
                {t('projects.title')}
              </h2>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('projects.subtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectionMode ? (
                <>
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${allSelected ? 'border-[var(--dome-accent)] bg-[var(--dome-accent)]' : 'border-[var(--dome-border)]'}`}>
                      {allSelected && <Check className="w-2.5 h-2.5" style={{ color: 'var(--base-text)' }} />}
                    </span>
                    {allSelected ? t('common.deselect_all') : t('common.select_all')}
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setBulkDeleteOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={{ background: 'color-mix(in srgb, var(--dome-error) 10%, transparent)', color: 'var(--dome-error)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('common.delete')} ({selectedIds.size})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => domeProject && onSelectProject(domeProject)}
                    disabled={!domeProject}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                    style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                  >
                    {t('projects.switch_to_dome')}
                  </button>
                  {selectableProjects.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectionMode(true)}
                      className="rounded-lg border px-3 py-1.5 text-xs"
                      style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                    >
                      {t('common.select')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCreateForm((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('projects.create_project')}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Stats strip ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-xl border p-3.5 flex flex-col gap-1.5"
                  style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                      {card.label}
                    </span>
                    <Icon className="w-3.5 h-3.5" style={{ color: card.color }} />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums" style={{ color: 'var(--dome-text)' }}>
                    {card.value}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Create form (collapsible) ──────────────────────────────────── */}
          {showCreateForm && (
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ borderColor: 'var(--dome-accent)', background: 'color-mix(in srgb, var(--dome-accent) 5%, var(--dome-surface))' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                {t('projects.new_project')}
              </h3>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={t('projects.project_name')}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) void handleCreateProject(); }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--dome-accent)]"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              />
              <textarea
                value={newProjectDescription}
                onChange={(e) => setNewProjectDescription(e.target.value)}
                placeholder={t('projects.brief_description')}
                rows={2}
                className="w-full resize-none rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCreateForm(false); setNewProjectName(''); setNewProjectDescription(''); }}
                  className="rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateProject()}
                  disabled={creating || !newProjectName.trim()}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {creating ? t('projects.creating') : t('projects.create_project')}
                </button>
              </div>
            </div>
          )}

          {/* ── Projects grid ─────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                {t('projects.your_projects')}
                {projects.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal" style={{ color: 'var(--dome-text-muted)' }}>
                    ({projects.length})
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={onOpenProjectLibrary}
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--dome-accent)' }}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {t('projects.open_library')}
              </button>
            </div>

            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border h-28 animate-pulse"
                    style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }} />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 flex flex-col items-center gap-3"
                style={{ borderColor: 'var(--dome-border)' }}>
                <Layers3 className="w-8 h-8" style={{ color: 'var(--dome-text-muted)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('projects.empty')}
                </p>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
                  style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('projects.create_project')}
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => {
                  const projectResources = resources.filter((r) => r.project_id === project.id);
                  const isActive = currentProject?.id === project.id;
                  const isSelected = selectedIds.has(project.id);
                  const isDome = project.id === 'default';

                  return (
                    <div
                      key={project.id}
                      className="group relative rounded-xl border transition-all"
                      style={{
                        borderColor: isSelected
                          ? 'var(--dome-accent)'
                          : isActive
                            ? 'color-mix(in srgb, var(--dome-accent) 50%, var(--dome-border))'
                            : 'var(--dome-border)',
                        background: isSelected
                          ? 'color-mix(in srgb, var(--dome-accent) 8%, var(--dome-surface))'
                          : isActive
                            ? 'color-mix(in srgb, var(--dome-accent) 5%, var(--dome-surface))'
                            : 'var(--dome-surface)',
                        boxShadow: isActive ? '0 0 0 1px color-mix(in srgb, var(--dome-accent) 30%, transparent)' : 'none',
                      }}
                    >
                      {/* Selection checkbox */}
                      {selectionMode && !isDome && (
                        <button
                          type="button"
                          onClick={() => toggleSelect(project.id)}
                          className="absolute top-3 left-3 z-10 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors"
                          style={{
                            borderColor: isSelected ? 'var(--dome-accent)' : 'var(--dome-border)',
                            background: isSelected ? 'var(--dome-accent)' : 'var(--dome-bg)',
                          }}
                          aria-checked={isSelected}
                          aria-label={t('projects.select_project_aria', { name: project.name })}
                        >
                          {isSelected && <Check className="w-3 h-3" style={{ color: 'var(--base-text)' }} />}
                        </button>
                      )}

                      {/* Main card content */}
                      <button
                        type="button"
                        onClick={() => {
                          if (selectionMode && !isDome) { toggleSelect(project.id); return; }
                          onSelectProject(project);
                        }}
                        className="w-full text-left p-4"
                        style={{ paddingLeft: selectionMode && !isDome ? '2.5rem' : undefined }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-sm truncate" style={{ color: 'var(--dome-text)' }}>
                                {project.name}
                              </p>
                              {isActive && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
                                  style={{ background: 'var(--dome-accent)', color: 'var(--base-text)' }}>
                                  {t('projects.active')}
                                </span>
                              )}
                              <KbBadge value={kbOverrides[project.id] ?? 'inherit'} />
                            </div>
                            {project.description?.trim() && (
                              <p className="mt-1 text-xs line-clamp-2" style={{ color: 'var(--dome-text-muted)' }}>
                                {project.description}
                              </p>
                            )}
                            <div className="mt-2.5 flex items-center gap-3">
                              <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                                <Layers3 className="w-3 h-3" />
                                {projectResources.length}
                              </span>
                            </div>
                          </div>
                          {!selectionMode && (
                            <ArrowRight className="w-4 h-4 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity mt-0.5"
                              style={{ color: 'var(--dome-text-muted)' }} />
                          )}
                        </div>
                      </button>

                      {/* Actions row */}
                      {!selectionMode && (
                        <div className="flex items-center gap-1 px-4 pb-3 border-t"
                          style={{ borderColor: 'var(--dome-border)' }}>
                          {/* KB override selector */}
                          <div className="relative flex-1">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setKbMenuFor(kbMenuFor === project.id ? null : project.id); }}
                              className="flex items-center gap-1 text-[11px] pt-2"
                              style={{ color: 'var(--dome-text-muted)' }}
                            >
                              <Brain className="w-3 h-3" />
                              <span>{t('projects.kb_llm')}:</span>
                              <span className="font-medium">
                                {kbOverrides[project.id] === 'enabled' ? t('projects.kb_llm_on')
                                  : kbOverrides[project.id] === 'disabled' ? t('projects.kb_llm_off')
                                    : t('projects.kb_llm_inherit')}
                              </span>
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>
                            {kbMenuFor === project.id && (
                              <div
                                className="absolute bottom-full left-0 mb-1 rounded-lg border shadow-lg z-20 py-1 min-w-[140px]"
                                style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
                              >
                                {(['inherit', 'enabled', 'disabled'] as const).map((val) => (
                                  <button
                                    key={val}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--dome-bg)] flex items-center justify-between"
                                    style={{ color: 'var(--dome-text)' }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setKbMenuFor(null);
                                      try {
                                        const r = await window.electron?.kbllm?.setProjectOverride?.({ projectId: project.id, override: val });
                                        const ok = r && typeof r === 'object' && 'success' in r && (r as { success?: boolean }).success;
                                        if (ok) setKbOverrides((prev) => ({ ...prev, [project.id]: val }));
                                        else showToast('error', t('settings.kb_llm.error_save'));
                                      } catch { showToast('error', t('settings.kb_llm.error_save')); }
                                    }}
                                  >
                                    {val === 'inherit' ? t('projects.kb_llm_inherit') : val === 'enabled' ? t('projects.kb_llm_on') : t('projects.kb_llm_off')}
                                    {(kbOverrides[project.id] ?? 'inherit') === val && <Check className="w-3 h-3 opacity-70" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {!isDome && (
                            <button
                              type="button"
                              title={t('projects.delete_project')}
                              onClick={(e) => { e.stopPropagation(); openDeleteProject(project); }}
                              className="shrink-0 p-1.5 rounded-lg mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[color-mix(in_srgb,var(--dome-error)_10%,transparent)]"
                              style={{ color: 'var(--dome-error)' }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KB dropdown backdrop ──────────────────────────────────────────── */}
      {kbMenuFor !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setKbMenuFor(null)} />
      )}

      {/* ── Single delete modal ────────────────────────────────────────────── */}
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
            <h3 id="delete-project-title" className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('projects.delete_critical_title')}
            </h3>
            <p className="mt-2 text-sm font-medium" style={{ color: 'var(--dome-error)' }}>
              {t('projects.delete_critical_warning')}
            </p>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--dome-text)' }}>{deleteTarget.name}</p>

            <div className="mt-4 rounded-xl border border-dashed p-3 text-sm" style={{ borderColor: 'var(--dome-border)' }}>
              {deleteImpactLoading ? (
                <p style={{ color: 'var(--dome-text-muted)' }}>{t('projects.loading')}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4" style={{ color: 'var(--dome-text-muted)' }}>
                  {DELETE_IMPACT_ORDER.map((key) => {
                    const n = deleteImpact?.[key] ?? 0;
                    if (n <= 0) return null;
                    return (
                      <li key={key}>
                        {t(`projects.delete_impact_${key}` as 'projects.delete_impact_resources')}:{' '}
                        <span className="tabular-nums" style={{ color: 'var(--dome-text)' }}>{n}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <label className="mt-4 block text-sm" style={{ color: 'var(--dome-text)' }} htmlFor="delete-project-confirm-input">
              {t('projects.delete_confirm_prompt')}
            </label>
            <input
              id="delete-project-confirm-input"
              autoComplete="off"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={t('projects.delete_confirm_placeholder')}
              className="mt-2 w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
            />
            {deleteConfirmName && deleteConfirmName !== deleteTarget.name ? (
              <p className="mt-2 text-xs" style={{ color: 'var(--dome-error)' }}>{t('projects.delete_confirm_mismatch')}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={() => { setDeleteTarget(null); setDeleteConfirmName(''); setDeleteImpact(null); }}
                className="rounded-xl border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteSubmitting || deleteImpactLoading || deleteConfirmName !== deleteTarget.name}
                onClick={() => void executeDeleteProject()}
                className="rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--dome-error)', color: 'var(--base-text)' }}
              >
                {deleteSubmitting ? t('projects.delete_deleting') : t('projects.delete_execute')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Bulk delete modal ──────────────────────────────────────────────── */}
      {bulkDeleteOpen && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl border p-5 shadow-xl"
            style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
          >
            <h3 className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {t('projects.delete_critical_title')}
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--dome-text-muted)' }}>
              {t('projects.delete_critical_warning')}
            </p>
            <ul className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {[...selectedIds].filter((id) => id !== 'default').map((id) => {
                const p = projects.find((x) => x.id === id);
                return p ? (
                  <li key={id} className="text-sm px-2 py-1 rounded-lg"
                    style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}>
                    {p.name}
                  </li>
                ) : null;
              })}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={bulkDeleteSubmitting}
                onClick={() => setBulkDeleteOpen(false)}
                className="rounded-xl border px-4 py-2 text-sm"
                style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text-muted)' }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={bulkDeleteSubmitting}
                onClick={() => void executeBulkDelete()}
                className="rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: 'var(--dome-error)', color: 'var(--base-text)' }}
              >
                {bulkDeleteSubmitting ? t('projects.delete_deleting') : t('projects.delete_execute')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
