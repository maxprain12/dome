import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, FileEdit, FileText, Image as ImageIcon, Maximize2, Music, Notebook, Presentation, Video, Link as LinkIcon, PanelRightClose, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTabStore, type DomeTab } from '@/lib/store/useTabStore';

interface WorkspaceSplitViewProps {
  tab: DomeTab;
  primary: ReactNode;
  reference: ReactNode;
}

interface ReferenceMeta {
  icon: ReactNode;
  label: string;
}

function getReferenceMeta(resourceType: string, t: ReturnType<typeof useTranslation>['t']): ReferenceMeta {
  const iconProps = { size: 11, strokeWidth: 2 };
  switch (resourceType) {
    case 'note':
      return { icon: <FileEdit {...iconProps} />, label: t('focused_editor.ref_type_note', 'Nota') };
    case 'pdf':
    case 'document':
      return { icon: <FileText {...iconProps} />, label: t('focused_editor.ref_type_doc', 'Documento') };
    case 'video':
      return { icon: <Video {...iconProps} />, label: t('focused_editor.ref_type_video', 'Video') };
    case 'audio':
      return { icon: <Music {...iconProps} />, label: t('focused_editor.ref_type_audio', 'Audio') };
    case 'image':
      return { icon: <ImageIcon {...iconProps} />, label: t('focused_editor.ref_type_image', 'Imagen') };
    case 'notebook':
      return { icon: <Notebook {...iconProps} />, label: t('focused_editor.ref_type_notebook', 'Notebook') };
    case 'ppt':
      return { icon: <Presentation {...iconProps} />, label: t('focused_editor.ref_type_ppt', 'Presentación') };
    case 'url':
    case 'youtube':
      return { icon: <LinkIcon {...iconProps} />, label: t('focused_editor.ref_type_link', 'Enlace') };
    default:
      return { icon: <FileText {...iconProps} />, label: t('focused_editor.ref_type_resource', 'Recurso') };
  }
}

export default function WorkspaceSplitView({ tab, primary, reference }: WorkspaceSplitViewProps) {
  const { t } = useTranslation();
  const startXRef = useRef(0);
  const startWidthRef = useRef(tab.splitWidth ?? 420);
  const [isResizing, setIsResizing] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth,
  );
  const closeSplit = useTabStore((s) => s.closeSplit);
  const resizeSplit = useTabStore((s) => s.resizeSplit);
  const swapSplit = useTabStore((s) => s.swapSplit);
  const openResourceTab = useTabStore((s) => s.openResourceTab);
  const splitResource = tab.splitResource;
  const splitWidth = tab.splitWidth ?? 420;

  // Track viewport width to enforce a responsive cap (max 50% of viewport on
  // narrow screens). The hard floor (320) and ceiling (760) live in the store.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setContainerWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    startXRef.current = event.clientX;
    startWidthRef.current = splitWidth;
    setIsResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      resizeSplit(startWidthRef.current - (moveEvent.clientX - startXRef.current), tab.id);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      setIsResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [resizeSplit, splitWidth, tab.id]);

  if (!splitResource) return <>{primary}</>;

  const refMeta = getReferenceMeta(splitResource.resourceType, t);
  // Cap reference pane to 50% of the viewport on narrow screens so the
  // primary editor always keeps usable space.
  const responsiveMax = containerWidth < 1280
    ? Math.max(320, Math.floor(containerWidth / 2))
    : 760;

  return (
    <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden" style={{ background: 'var(--dome-surface)' }}>
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {primary}
      </div>

      <div
        role="separator"
        aria-label={t('focused_editor.resize_reference')}
        className="w-1.5 shrink-0 cursor-col-resize transition-colors duration-150"
        style={{
          background: isResizing ? 'var(--dome-accent)' : 'var(--dome-border)',
        }}
        onMouseEnter={(e) => {
          if (!isResizing) (e.currentTarget as HTMLElement).style.background = 'var(--border-hover)';
        }}
        onMouseLeave={(e) => {
          if (!isResizing) (e.currentTarget as HTMLElement).style.background = 'var(--dome-border)';
        }}
        onPointerDown={handlePointerDown}
      />

      <aside
        className="flex flex-col min-h-0 overflow-hidden"
        style={{
          width: Math.min(splitWidth, responsiveMax),
          minWidth: 320,
          maxWidth: responsiveMax,
          borderLeft: '1px solid var(--dome-border)',
          background: 'var(--dome-bg)',
        }}
      >
        <div
          className="flex h-9 shrink-0 items-center gap-2 px-3"
          style={{ borderBottom: '1px solid var(--dome-border)' }}
        >
          <PanelRightClose size={14} strokeWidth={1.8} style={{ color: 'var(--dome-text-muted)' }} />

          {/* Type badge */}
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{
              background: 'var(--dome-bg-hover)',
              color: 'var(--dome-text-muted)',
              letterSpacing: '0.04em',
            }}
            title={refMeta.label}
          >
            {refMeta.icon}
            {refMeta.label}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
              {splitResource.title || t('focused_editor.reference')}
            </p>
          </div>

          {/* Swap primary ↔ reference (only meaningful when current tab has its own resource) */}
          {tab.resourceId && (
            <button
              type="button"
              className="focused-editor-icon-button"
              onClick={() => swapSplit(tab.id)}
              title={t('focused_editor.swap_panes', 'Intercambiar paneles')}
              aria-label={t('focused_editor.swap_panes', 'Intercambiar paneles')}
            >
              <ArrowLeftRight size={13} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            className="focused-editor-icon-button"
            onClick={() => openResourceTab(splitResource.resourceId, splitResource.resourceType, splitResource.title)}
            title={t('focused_editor.open_reference_tab')}
            aria-label={t('focused_editor.open_reference_tab')}
          >
            <Maximize2 size={13} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="focused-editor-icon-button"
            onClick={() => closeSplit(tab.id)}
            title={t('focused_editor.close_reference')}
            aria-label={t('focused_editor.close_reference')}
          >
            <X size={13} strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {reference}
        </div>
      </aside>
    </div>
  );
}
