/** Sidebar resource/folder context menu (03/T02 — extracted from UnifiedSidebar.tsx). */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Edit3, Trash2, FolderInput, FolderPlus, Check, PanelRightOpen, Maximize2 } from 'lucide-react';
import type { Resource } from '@/lib/hooks/useResources';
import { FOLDER_COLOR_OPTIONS } from '@/lib/ui/palettes';
import { parseMeta, type CtxState } from './sidebarHelpers';

export interface ContextMenuProps {
  state: CtxState;
  onClose: () => void;
  onRename: (r: Resource) => void;
  onMove: (r: Resource) => void;
  onColorChange: (r: Resource, color: string) => void;
  onDelete: (r: Resource) => void;
  onNewFolder: (parentId: string | null) => void;
  onOpenInSplit?: (r: Resource) => void;
  onOpenInWindow?: (r: Resource) => void;
  /**
   * True when the user has an active tab that can host a split view
   * (any non-home tab where `openResourceInSplit` is meaningful).
   */
  canOpenInSplit?: boolean;
}

export default function ContextMenu({
  state,
  onClose,
  onRename,
  onMove,
  onColorChange,
  onDelete,
  onNewFolder,
  onOpenInSplit,
  onOpenInWindow,
  canOpenInSplit,
}: ContextMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showColors, setShowColors] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<string | null>(null);

  const prevVisibleRef = useRef(state.visible);
  if (state.visible !== prevVisibleRef.current) {
    prevVisibleRef.current = state.visible;
    if (state.visible) {
      setShowColors(false);
      setHoveredColor(null);
    }
  }

  useEffect(() => {
    if (!state.visible) return;
    const handle = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('keydown', handleKey); };
  }, [state.visible, onClose]);

  if (!state.visible || !state.resource) return null;
  const r = state.resource;
  const isFolder = r.type === 'folder';
  const currentColor = parseMeta(r).color as string | undefined;

  const hoveredLabel = hoveredColor
    ? (FOLDER_COLOR_OPTIONS.find((o) => o.value === hoveredColor)?.label ?? null)
    : null;

  const menuWidth = 196;
  const left = Math.min(state.x, window.innerWidth - menuWidth - 8);
  const estimatedHeight = isFolder ? 320 : 200;
  const top = Math.min(state.y, window.innerHeight - estimatedHeight - 8);

  return (
    <div
      ref={menuRef}
      className="fixed z-[var(--z-popover)] overflow-hidden"
      style={{
        left,
        top,
        width: menuWidth,
        background: 'var(--dome-surface)',
        border: '1px solid var(--dome-border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)',
      }}
    >
      {/* Resource label */}
      <div className="px-3 pt-2.5 pb-1.5" style={{ borderBottom: '1px solid var(--dome-border)' }}>
        <p className="truncate" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--dome-text-muted)' }}>
          {isFolder ? 'Carpeta' : r.type === 'notebook' ? 'Cuaderno' : r.type === 'url' ? 'URL' : r.type === 'pdf' ? 'PDF' : 'Archivo'}
        </p>
        <p className="truncate mt-0.5" style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--dome-text)' }}>{r.title}</p>
      </div>

      <div style={{ padding: '4px 0' }}>
        {/* Open as reference / popout — only for non-folder resources */}
        {!isFolder && onOpenInSplit && canOpenInSplit && (
          <CtxItem
            icon={<PanelRightOpen className="size-3.5" />}
            label={t('focused_editor.open_reference', 'Abrir como referencia')}
            onClick={() => { onOpenInSplit(r); onClose(); }}
          />
        )}
        {!isFolder && onOpenInWindow && r.type === 'note' && (
          <CtxItem
            icon={<Maximize2 className="size-3.5" />}
            label={t('focused_editor.popout', 'Abrir en ventana')}
            onClick={() => { onOpenInWindow(r); onClose(); }}
          />
        )}
        {!isFolder && (onOpenInSplit || onOpenInWindow) && (
          <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 6px' }} />
        )}

        {/* Rename */}
        <CtxItem icon={<Edit3 className="size-3.5" />} label="Renombrar" onClick={() => { onRename(r); onClose(); }} />

        {/* Move */}
        <CtxItem icon={<FolderInput className="size-3.5" />} label="Mover a carpeta" onClick={() => { onMove(r); onClose(); }} />

        {/* New subfolder — folders only */}
        {isFolder && (
          <CtxItem icon={<FolderPlus className="size-3.5" />} label="Nueva subcarpeta" onClick={() => { onNewFolder(r.id); onClose(); }} />
        )}

        {/* Color picker — folders only */}
        {isFolder && (
          <>
            <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 6px' }} />
            <button
              type="button"
              className="flex items-center w-full text-left transition-colors"
              style={{
                gap: 8, padding: '6px 12px', fontSize: 12.5, border: 'none', cursor: 'pointer',
                color: 'var(--dome-text)',
                background: showColors ? 'var(--dome-bg-hover)' : 'transparent',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover)'; }}
              onMouseLeave={(e) => { if (!showColors) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              onClick={() => setShowColors((s) => !s)}
            >
              <span
                className="size-3.5 rounded-full shrink-0 flex items-center justify-center"
                style={{
                  background: currentColor?.startsWith('#') ? currentColor : 'var(--dome-accent)',
                  boxShadow: `0 0 0 1.5px ${currentColor?.startsWith('#') ? currentColor + '44' : 'transparent'}`,
                }}
              />
              <span className="flex-1" style={{ fontWeight: 500 }}>Color de carpeta</span>
              <ChevronDown
                className="size-3 shrink-0"
                style={{ color: 'var(--dome-text-muted)', transform: showColors ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms' }}
              />
            </button>

            {showColors && (
              <div style={{ padding: '6px 12px 10px' }}>
                {/* Color grid */}
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {FOLDER_COLOR_OPTIONS.map((opt) => {
                    const isActive = currentColor === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onColorChange(r, opt.value); onClose(); }}
                        onMouseEnter={() => setHoveredColor(opt.value)}
                        onMouseLeave={() => setHoveredColor(null)}
                        className="relative flex items-center justify-center transition-transform"
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: opt.value, border: 'none', cursor: 'pointer',
                          outline: isActive ? `2.5px solid ${opt.value}` : '2px solid transparent',
                          outlineOffset: isActive ? 2 : 0,
                          transform: hoveredColor === opt.value ? 'scale(1.18)' : 'scale(1)',
                          transition: 'transform 120ms, outline 120ms',
                          boxShadow: hoveredColor === opt.value ? `0 2px 8px ${opt.value}66` : 'none',
                        }}
                      >
                        {isActive && <Check className="size-2.5 text-white" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>

                {/* Color label tooltip */}
                <div style={{ height: 16, display: 'flex', alignItems: 'center' }}>
                  {hoveredLabel ? (
                    <span style={{
                      fontSize: 12, fontWeight: 500, color: hoveredColor ?? 'var(--dome-text-muted)',
                      transition: 'color 100ms',
                    }}>
                      {hoveredLabel}
                    </span>
                  ) : currentColor ? (
                    <span style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>
                      {FOLDER_COLOR_OPTIONS.find((o) => o.value === currentColor)?.label ?? 'Personalizado'}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--dome-text-muted)' }}>{t('ui.no_color')}</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ height: 1, background: 'var(--dome-border)', margin: '4px 6px' }} />

        {/* Delete */}
        <CtxItem
          icon={<Trash2 className="size-3.5" />}
          label="Eliminar"
          onClick={() => { onDelete(r); onClose(); }}
          danger
        />
      </div>
    </div>
  );
}

// Shared context menu item
function CtxItem({ icon, label, onClick, danger = false }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      className="flex items-center w-full text-left transition-colors"
      style={{
        gap: 8, padding: '6px 12px', fontSize: 12.5, border: 'none', cursor: 'pointer',
        color: danger ? 'var(--dome-error)' : 'var(--dome-text)',
        background: hovered ? (danger ? 'rgba(239,68,68,0.08)' : 'var(--dome-bg-hover)') : 'transparent',
        fontWeight: 450,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <span style={{ opacity: 0.75, color: danger ? 'var(--dome-error)' : 'var(--dome-text-muted)', display: 'flex' }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Move folder modal
// ---------------------------------------------------------------------------
