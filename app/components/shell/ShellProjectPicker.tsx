import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { db } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import ManyIcon from '@/components/many/ManyIcon';
import type { Project } from '@/types';

interface ShellProjectPickerProps {
  compact?: boolean;
}

export default function ShellProjectPicker({ compact = false }: ShellProjectPickerProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickProjectName, setQuickProjectName] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentProject = useAppStore((s) => s.currentProject);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const openProjectsTab = useTabStore((s) => s.openProjectsTab);

  const hubProjectId = currentProject?.id ?? 'default';
  const activeLabel =
    currentProject?.name ?? projects.find((p) => p.id === hubProjectId)?.name ?? 'Dome';

  const fetchProjects = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron?.db?.projects) return;
    try {
      const result = await window.electron.db.projects.getAll();
      if (result?.success && result.data) setProjects(result.data as Project[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;
    const onCreated = () => { void fetchProjects(); };
    const onDeleted = () => { void fetchProjects(); };
    const u1 = window.electron.on('project:created', onCreated);
    const u2 = window.electron.on('project:deleted', onDeleted);
    return () => {
      u1?.();
      u2?.();
    };
  }, [fetchProjects]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const handleProjectChange = useCallback(
    (projectId: string) => {
      const next = projects.find((p) => p.id === projectId) ?? null;
      setCurrentProject(next);
      setMenuOpen(false);
    },
    [projects, setCurrentProject],
  );

  const handleQuickCreate = useCallback(async () => {
    const name = quickProjectName.trim();
    if (!name || quickCreating || !db.isAvailable()) return;
    setQuickCreating(true);
    try {
      const result = await db.createProject({ name });
      if (result.success && result.data) {
        setQuickProjectName('');
        await fetchProjects();
        setCurrentProject(result.data);
        setMenuOpen(false);
        showToast('success', t('projects.created'));
      } else {
        showToast('error', result.error ?? t('toast.project_create_error'));
      }
    } finally {
      setQuickCreating(false);
    }
  }, [fetchProjects, quickCreating, quickProjectName, setCurrentProject, t]);

  return (
    <div ref={menuRef} className="dome-shell-project-picker relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className={`dome-shell-project-trigger${compact ? ' dome-shell-project-trigger--compact' : ''}`}
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
        title={activeLabel}
      >
        <span className="dome-shell-project-logo" style={{ filter: 'var(--dome-logo-filter)' }}>
          <ManyIcon size={compact ? 14 : 16} />
        </span>
        {!compact ? (
          <>
            <span className="dome-shell-project-label">{activeLabel}</span>
            <ChevronDown
              className={`dome-shell-project-chevron ${menuOpen ? 'is-open' : ''}`}
              strokeWidth={2.5}
              aria-hidden
            />
          </>
        ) : null}
      </button>

      {menuOpen ? (
        <div className="dome-shell-project-menu" role="listbox">
          <div className="dome-shell-project-list">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === hubProjectId}
                onClick={() => handleProjectChange(project.id)}
                className="dome-shell-project-option"
                data-active={project.id === hubProjectId ? 'true' : 'false'}
              >
                {project.name}
              </button>
            ))}
          </div>
          <div className="dome-shell-project-quick">
            <input
              value={quickProjectName}
              onChange={(e) => setQuickProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleQuickCreate();
                }
              }}
              placeholder={t('sidebar.quick_create_project_placeholder')}
              className="dome-shell-project-input"
            />
            <button
              type="button"
              disabled={quickCreating || !quickProjectName.trim()}
              onClick={() => void handleQuickCreate()}
              className="dome-shell-project-create"
            >
              {t('sidebar.quick_create_project_button')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              openProjectsTab();
            }}
            className="dome-shell-project-manage"
          >
            {t('sidebar.manage_projects')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
