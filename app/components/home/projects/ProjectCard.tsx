import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, Brain, ChevronDown, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/lib/db/client';

function kbValueLabel(
  value: 'inherit' | 'enabled' | 'disabled',
  t: (key: string) => string,
): string {
  if (value === 'enabled') return t('projects.kb_llm_value_on');
  if (value === 'disabled') return t('projects.kb_llm_value_off');
  return t('projects.kb_llm_value_inherit');
}

function ProjectKbMenu({
  open,
  anchorRef,
  kbOverride,
  onSelect,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLButtonElement | null>;
  kbOverride: 'inherit' | 'enabled' | 'disabled';
  onSelect: (value: 'inherit' | 'enabled' | 'disabled') => void;
}) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 168) });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchorRef]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="p-project-kb-menu-portal"
      role="menu"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: pos.width,
        zIndex: 'calc(var(--z-popover, 50) + 1)',
      }}
    >
      {(['inherit', 'enabled', 'disabled'] as const).map((val) => (
        <button
          key={val}
          type="button"
          role="menuitem"
          className={kbOverride === val ? 'is-selected' : ''}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(val);
          }}
        >
          <span>{kbValueLabel(val, t)}</span>
          {kbOverride === val ? <Check size={12} strokeWidth={2.5} aria-hidden /> : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function ProjectCard({
  project,
  resourceCount,
  isActive,
  isSelected,
  isDome,
  selectionMode,
  kbOverride,
  kbMenuOpen,
  onSelect,
  onToggleSelect,
  onKbMenuToggle,
  onKbOverrideChange,
  onDelete,
}: {
  project: Project;
  resourceCount: number;
  isActive: boolean;
  isSelected: boolean;
  isDome: boolean;
  selectionMode: boolean;
  kbOverride: 'inherit' | 'enabled' | 'disabled';
  kbMenuOpen: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
  onKbMenuToggle: () => void;
  onKbOverrideChange: (value: 'inherit' | 'enabled' | 'disabled') => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const kbTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <article
      className={`p-project-card ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''} ${kbMenuOpen ? 'is-menu-open' : ''} ${selectionMode && !isDome ? 'has-select' : ''}`}
    >
      {selectionMode && !isDome ? (
        <button
          type="button"
          className={`p-project-select ${isSelected ? 'is-on' : ''}`}
          onClick={onToggleSelect}
          aria-pressed={isSelected}
          aria-label={t('projects.select_project_aria', { name: project.name })}
        >
          {isSelected ? <Check size={11} strokeWidth={2.5} aria-hidden /> : null}
        </button>
      ) : null}

      {!selectionMode && !isDome ? (
        <button
          type="button"
          className="p-project-delete-btn"
          title={t('projects.delete_project')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      <div className="p-project-card-main">
        <button
          type="button"
          className="p-project-card-hit"
          onClick={() => {
            if (selectionMode && !isDome) {
              onToggleSelect();
              return;
            }
            onSelect();
          }}
        >
          <div className="p-project-card-head">
            <div className="min-w-0">
              <h3 className="p-project-card-title">{project.name}</h3>
              {project.description?.trim() ? (
                <p className="p-project-card-desc">{project.description}</p>
              ) : null}
            </div>
          </div>
          {selectionMode ? (
            <div className="p-project-card-meta">
              {isActive ? <span className="p-project-tag active">{t('projects.active')}</span> : null}
              <span className="count">
                {resourceCount}{' '}
                {t(resourceCount === 1 ? 'projects.resource_one' : 'projects.resource_other')}
              </span>
            </div>
          ) : null}
        </button>

        {!selectionMode ? (
          <div className="p-project-card-meta">
            {isActive ? <span className="p-project-tag active">{t('projects.active')}</span> : null}
            <span className="count">
              {resourceCount}{' '}
              {t(resourceCount === 1 ? 'projects.resource_one' : 'projects.resource_other')}
            </span>
            <button
              ref={kbTriggerRef}
              type="button"
              className={`p-project-kb-trigger ${kbOverride !== 'inherit' ? `is-${kbOverride}` : ''} ${kbMenuOpen ? 'is-open' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onKbMenuToggle();
              }}
              aria-expanded={kbMenuOpen}
              aria-haspopup="menu"
              title={t('projects.kb_llm_helper')}
            >
              <Brain size={11} strokeWidth={2} aria-hidden />
              <span className="p-project-kb-trigger-label">{kbValueLabel(kbOverride, t)}</span>
              <ChevronDown size={11} strokeWidth={2} className="p-project-kb-trigger-chevron" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {!selectionMode ? (
        <ProjectKbMenu
          open={kbMenuOpen}
          anchorRef={kbTriggerRef}
          kbOverride={kbOverride}
          onSelect={onKbOverrideChange}
        />
      ) : null}
    </article>
  );
}
