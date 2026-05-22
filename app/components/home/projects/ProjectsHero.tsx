import { useTranslation } from 'react-i18next';
import { Check, FolderOpen, Plus, Trash2 } from 'lucide-react';
import type { Project } from '@/lib/db/client';

export function ProjectsHero({
  projectCount,
  currentProject,
  activeResourceCount,
  selectionMode,
  selectableCount,
  selectedCount,
  allSelected,
  onSwitchToDome,
  onToggleSelectMode,
  onToggleSelectAll,
  onBulkDelete,
  onCancelSelection,
  onCreateClick,
  canSwitchToDome,
}: {
  projectCount: number;
  currentProject: Project | null;
  activeResourceCount: number;
  selectionMode: boolean;
  selectableCount: number;
  selectedCount: number;
  allSelected: boolean;
  onSwitchToDome: () => void;
  onToggleSelectMode: () => void;
  onToggleSelectAll: () => void;
  onBulkDelete: () => void;
  onCancelSelection: () => void;
  onCreateClick: () => void;
  canSwitchToDome: boolean;
}) {
  const { t, i18n } = useTranslation();

  const eyebrowDate = new Date()
    .toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');

  return (
    <header className="h-hero p-projects-hero">
      <div className="h-hero-main">
        <div className="h-eyebrow h-hero-eyebrow">
          <span>{eyebrowDate}</span>
          <span className="sep" aria-hidden />
          <span>{t('projects.workspaces_count', { count: projectCount })}</span>
        </div>

        <h1 className="h-page-title">{t('projects.title')}</h1>

        <p className="h-hero-sub">
          {currentProject
            ? t('projects.active_project', { name: currentProject.name })
            : t('projects.subtitle')}
        </p>

        <div className="h-hero-actions">
          {selectionMode ? (
            <>
              <button type="button" className="h-pill-btn" onClick={onToggleSelectAll}>
                <Check size={13} strokeWidth={2} aria-hidden />
                {allSelected ? t('common.deselect_all') : t('common.select_all')}
              </button>
              {selectedCount > 0 ? (
                <button type="button" className="h-pill-btn" onClick={onBulkDelete}>
                  <Trash2 size={13} strokeWidth={2} aria-hidden />
                  {t('common.delete')} ({selectedCount})
                </button>
              ) : null}
              <button type="button" className="h-pill-btn" onClick={onCancelSelection}>
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <>
              {canSwitchToDome ? (
                <button type="button" className="h-pill-btn" onClick={onSwitchToDome}>
                  <FolderOpen size={13} strokeWidth={2} aria-hidden />
                  {t('projects.switch_to_dome')}
                </button>
              ) : null}
              {selectableCount > 0 ? (
                <button type="button" className="h-pill-btn" onClick={onToggleSelectMode}>
                  {t('common.select')}
                </button>
              ) : null}
              <button type="button" className="h-pill-btn primary" onClick={onCreateClick}>
                <Plus size={13} strokeWidth={2} aria-hidden />
                {t('projects.create_project')}
              </button>
            </>
          )}
        </div>
      </div>

      {currentProject ? (
        <div className="p-projects-hero-card" aria-label={t('projects.section_workspace')}>
          <span className="label">{t('projects.section_workspace')}</span>
          <span className="value">{activeResourceCount}</span>
          <span className="sub">{t('projects.hero_active_resources', { count: activeResourceCount })}</span>
        </div>
      ) : null}
    </header>
  );
}
