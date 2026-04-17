/**
 * DashboardCanvas — renders and edits the home dashboard.
 *
 * Sections are displayed as a simple vertical stack sorted by their `y` value.
 * In edit mode the user can:
 *   - Toggle section visibility
 *   - Reorder sections with ↑ / ↓ controls
 *   - Enable / disable / reorder quick actions
 *
 * This intentionally avoids a pixel-grid library so the layout is always
 * compact (no gaps) and the editing experience is straightforward.
 */

import { useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  Eye,
  GripVertical,
  Plus,
  Calendar,
  MessageSquarePlus,
  Upload,
  WalletCards,
  Pencil,
  Layers,
  Search,
  Zap,
  BarChart2,
  CheckSquare,
  PlayCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type {
  DashboardLayoutWidgetId,
  HomeDashboardPreferences,
  HomeDashboardWidgets,
  HomeQuickActionId,
} from '@/types';
import { DASHBOARD_LAYOUT_WIDGET_IDS } from '@/types';
import { mergeLayoutAfterGridChange } from '@/lib/settings/home-dashboard';

// ─── Constants ───────────────────────────────────────────────────────────────

const ALL_QUICK_IDS: HomeQuickActionId[] = [
  'newNote',
  'upload',
  'newChat',
  'learn',
  'calendar',
];

const ACTION_ICONS: Record<HomeQuickActionId, LucideIcon> = {
  newNote: Plus,
  upload: Upload,
  newChat: MessageSquarePlus,
  learn: WalletCards,
  calendar: Calendar,
};

const SECTION_ICONS: Record<string, LucideIcon> = {
  hero: Pencil,
  search: Search,
  quickActions: Zap,
  momentum: BarChart2,
  weeklyActivity: Layers,
  pendingToday: CheckSquare,
  continueActivity: PlayCircle,
};

type WidgetKey = keyof HomeDashboardWidgets;

function widgetKeyForId(id: DashboardLayoutWidgetId): WidgetKey | null {
  switch (id) {
    case 'search':
    case 'momentum':
    case 'weeklyActivity':
    case 'pendingToday':
    case 'continueActivity':
      return id;
    default:
      return null;
  }
}

// ─── Slots type ──────────────────────────────────────────────────────────────

export type DashboardCanvasSlots = {
  [K in DashboardLayoutWidgetId]?: ReactNode;
} & { hero: ReactNode };

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Small count badge */
function CountBadge({ count, muted = false }: { count: number; muted?: boolean }) {
  if (count === 0) return null;
  return (
    <span
      className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
      style={
        muted
          ? { background: 'var(--dome-border, var(--border))', color: 'var(--dome-text-secondary, var(--secondary-text))' }
          : { background: 'var(--dome-accent, var(--accent))', color: 'var(--base-text)' }
      }
    >
      {count}
    </span>
  );
}

/** Section label inside the edit panel columns */
function PanelHeading({ children, count, muted }: { children: ReactNode; count?: number; muted?: boolean }) {
  return (
    <p
      className="mb-3 flex items-center text-[11px] font-bold uppercase tracking-widest"
      style={{ color: 'var(--dome-text-secondary, var(--secondary-text))' }}
    >
      {children}
      {count !== undefined && <CountBadge count={count} muted={muted} />}
    </p>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DashboardCanvas({
  isEditing,
  preferences,
  onUpdatePreferences,
  visibleIds,
  slots,
}: {
  isEditing: boolean;
  preferences: HomeDashboardPreferences;
  onUpdatePreferences: (next: HomeDashboardPreferences) => Promise<void>;
  visibleIds: ReadonlySet<string>;
  slots: DashboardCanvasSlots;
}) {
  const { t } = useTranslation();

  // ── Derive ordered section list from layout y-values ──────────────────────
  // Hero is ALWAYS first (it's static and not reorderable).
  // The rest sort by their saved y-value so user order is respected.
  const orderedSectionIds = useMemo<DashboardLayoutWidgetId[]>(() => {
    const layoutMap = new Map(preferences.layout.map((l) => [l.i, l.y]));
    const rest = DASHBOARD_LAYOUT_WIDGET_IDS.filter((id) => id !== 'hero').sort(
      (a, b) => (layoutMap.get(a) ?? 99) - (layoutMap.get(b) ?? 99),
    );
    return ['hero', ...rest];
  }, [preferences.layout]);

  // ── Visible sections (have a slot rendered) ───────────────────────────────
  const visibleSections = useMemo(
    () => orderedSectionIds.filter((id) => visibleIds.has(id) && slots[id] != null),
    [orderedSectionIds, visibleIds, slots],
  );

  // ── Hidden widget keys ────────────────────────────────────────────────────
  // NOTE: hiddenWidgetKeys computed but not currently used in render
  // (Object.keys(preferences.widgets) as WidgetKey[]).filter((k) => !preferences.widgets[k]),

  // ── Available quick actions (not active) ─────────────────────────────────
  const availableQuickIds = ALL_QUICK_IDS.filter((id) => !preferences.quickActions.includes(id));

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Reorder sections: swap index with index+dir */
  const moveSection = useCallback(
    (id: DashboardLayoutWidgetId, dir: -1 | 1) => {
      const idx = orderedSectionIds.indexOf(id);
      if (idx < 0) return;

      // Build new ordered list
      const next = [...orderedSectionIds];
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= next.length) return;
      // Don't move hero
      if (next[swapIdx] === 'hero' || id === 'hero') return;
      [next[idx], next[swapIdx]] = [next[swapIdx]!, next[idx]!];

      // Map new order → y values (multiples of 10 to leave room)
      const pseudoLayout = next.map((sectionId, i) => ({
        i: sectionId,
        x: 0,
        y: i * 10,
        w: 12,
        h: 5,
      }));

      const merged = mergeLayoutAfterGridChange(preferences.layout, pseudoLayout, visibleIds);
      void onUpdatePreferences({ ...preferences, layout: merged });
    },
    [orderedSectionIds, preferences, visibleIds, onUpdatePreferences],
  );

  const hideSection = useCallback(
    (id: DashboardLayoutWidgetId) => {
      const wk = widgetKeyForId(id);
      if (!wk) return;
      void onUpdatePreferences({ ...preferences, widgets: { ...preferences.widgets, [wk]: false } });
    },
    [preferences, onUpdatePreferences],
  );

  const showWidget = useCallback(
    (wk: WidgetKey) => {
      void onUpdatePreferences({ ...preferences, widgets: { ...preferences.widgets, [wk]: true } });
    },
    [preferences, onUpdatePreferences],
  );

  const moveQuickAction = useCallback(
    (index: number, dir: -1 | 1) => {
      const next = [...preferences.quickActions];
      const j = index + dir;
      if (j < 0 || j >= next.length) return;
      [next[index], next[j]] = [next[j]!, next[index]!];
      void onUpdatePreferences({ ...preferences, quickActions: next });
    },
    [preferences, onUpdatePreferences],
  );

  const toggleQuickAction = useCallback(
    (id: HomeQuickActionId) => {
      const has = preferences.quickActions.includes(id);
      if (has && preferences.quickActions.length <= 1) return;
      const next = has
        ? preferences.quickActions.filter((x) => x !== id)
        : [...preferences.quickActions, id];
      void onUpdatePreferences({ ...preferences, quickActions: next });
    },
    [preferences, onUpdatePreferences],
  );

  // ── The non-hero sections (hero is static) ────────────────────────────────
  const reorderableSections = orderedSectionIds.filter((id) => id !== 'hero');
  const reorderableVisible = reorderableSections.filter((id) => visibleIds.has(id) && slots[id] != null);

  return (
    <div className="w-full min-w-0">

      {/* ── Edit mode panel ── */}
      {isEditing ? (
        <div
          className="mb-5 overflow-hidden rounded-2xl border"
          style={{
            borderColor: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 30%, var(--dome-border, var(--border)))',
            background: 'var(--dome-surface, var(--bg-secondary))',
          }}
        >
          {/* Panel title */}
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{
              background: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 8%, var(--dome-surface, var(--bg-secondary)))',
              borderBottom: '1px solid color-mix(in srgb, var(--dome-accent, var(--accent)) 20%, var(--dome-border, var(--border)))',
            }}
          >
            <Pencil className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--dome-accent, var(--accent))' }} aria-hidden />
            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--dome-accent, var(--accent))' }}>
              {t('dashboard.edit_mode_hint')}
            </p>
          </div>

          {/* Two-column body */}
          <div className="grid grid-cols-1 sm:grid-cols-2">

            {/* ── Left: Sections order & visibility ── */}
            <div
              className="px-4 py-4"
              style={{ borderRight: '1px solid var(--dome-border, var(--border))' }}
            >
              <PanelHeading count={reorderableVisible.length}>
                {t('dashboard.customize_widgets')}
              </PanelHeading>

              {/* Visible sections */}
              <ul className="space-y-1.5">
                {reorderableSections.map((id, _i) => {
                  const isVisible = visibleIds.has(id) && slots[id] != null;
                  const canHide = widgetKeyForId(id) != null;
                  const Icon = SECTION_ICONS[id] ?? Layers;
                  // index within reorderable (for move buttons)
                  const posInVisible = reorderableVisible.indexOf(id);
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all"
                      style={{
                        borderColor: isVisible
                          ? 'var(--dome-border, var(--border))'
                          : 'color-mix(in srgb, var(--dome-border, var(--border)) 60%, transparent)',
                        background: isVisible ? 'var(--dome-bg, var(--bg))' : 'transparent',
                        opacity: isVisible ? 1 : 0.55,
                      }}
                    >
                      <GripVertical
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
                        aria-hidden
                      />
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                        style={{
                          background: isVisible
                            ? 'color-mix(in srgb, var(--dome-accent, var(--accent)) 12%, transparent)'
                            : 'transparent',
                        }}
                      >
                        <Icon
                          className="h-3 w-3"
                          style={{ color: isVisible ? 'var(--dome-accent, var(--accent))' : 'var(--dome-text-muted)' }}
                          aria-hidden
                        />
                      </span>
                      <span
                        className="flex-1 truncate text-sm font-medium"
                        style={{ color: 'var(--dome-text, var(--primary-text))' }}
                      >
                        {t(`dashboard.layout_label_${id}`)}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {isVisible && (
                          <>
                            <button
                              type="button"
                              className="rounded-lg p-1 transition-colors disabled:opacity-25"
                              disabled={posInVisible <= 0}
                              onClick={() => moveSection(id as DashboardLayoutWidgetId, -1)}
                              aria-label={t('dashboard.move_up')}
                              style={{ color: 'var(--dome-text-secondary)' }}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded-lg p-1 transition-colors disabled:opacity-25"
                              disabled={posInVisible >= reorderableVisible.length - 1}
                              onClick={() => moveSection(id as DashboardLayoutWidgetId, 1)}
                              aria-label={t('dashboard.move_down')}
                              style={{ color: 'var(--dome-text-secondary)' }}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {canHide && (
                          <button
                            type="button"
                            className="rounded-lg p-1 transition-colors"
                            onClick={() =>
                              isVisible
                                ? hideSection(id as DashboardLayoutWidgetId)
                                : showWidget(widgetKeyForId(id as DashboardLayoutWidgetId)!)
                            }
                            aria-label={isVisible ? t('dashboard.hide_widget') : t('dashboard.show_widget')}
                            style={{ color: isVisible ? 'var(--dome-text-muted)' : 'var(--dome-accent, var(--accent))' }}
                          >
                            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              <p
                className="mt-3 text-[11px] leading-relaxed"
                style={{ color: 'var(--dome-text-muted, var(--tertiary-text))' }}
              >
                {t('dashboard.drag_hint')}
              </p>
            </div>

            {/* ── Right: Quick actions ── */}
            <div className="px-4 py-4">
              <PanelHeading count={preferences.quickActions.length}>
                {t('dashboard.customize_quick_actions')}
              </PanelHeading>

              {/* Active actions */}
              <ul className="space-y-1.5">
                {preferences.quickActions.map((id, index) => {
                  const Icon = ACTION_ICONS[id];
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors"
                      style={{ borderColor: 'var(--dome-border, var(--border))', background: 'var(--dome-bg, var(--bg))' }}
                    >
                      <GripVertical
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--dome-text-muted)' }}
                        aria-hidden
                      />
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--dome-accent, var(--accent))' }}
                        aria-hidden
                      />
                      <span
                        className="flex-1 truncate text-sm font-medium"
                        style={{ color: 'var(--dome-text, var(--primary-text))' }}
                      >
                        {t(`dashboard.action_label_${id}`)}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          className="rounded-lg p-1 transition-colors disabled:opacity-25"
                          disabled={index === 0}
                          onClick={() => moveQuickAction(index, -1)}
                          aria-label={t('dashboard.move_up')}
                          style={{ color: 'var(--dome-text-secondary)' }}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1 transition-colors disabled:opacity-25"
                          disabled={index === preferences.quickActions.length - 1}
                          onClick={() => moveQuickAction(index, 1)}
                          aria-label={t('dashboard.move_down')}
                          style={{ color: 'var(--dome-text-secondary)' }}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-1 transition-colors"
                          onClick={() => toggleQuickAction(id)}
                          aria-label={t('dashboard.hide_widget')}
                          style={{ color: 'var(--dome-text-muted)' }}
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Add inactive quick actions */}
              {availableQuickIds.length > 0 && (
                <div className="mt-2 space-y-1">
                  {availableQuickIds.map((id) => {
                    const Icon = ACTION_ICONS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          void onUpdatePreferences({
                            ...preferences,
                            quickActions: [...preferences.quickActions, id],
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition-colors"
                        style={{ borderColor: 'var(--dome-border)', borderStyle: 'dashed', color: 'var(--dome-text-secondary)' }}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                        <span className="font-medium opacity-70">{t(`dashboard.action_label_${id}`)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Dashboard sections — simple vertical stack ── */}
      <div className="flex flex-col gap-3">
        {visibleSections.map((id, _i) => {
          const node = slots[id];
          if (node == null) return null;
          const canHide = widgetKeyForId(id) != null;
          // Position among non-hero visible sections for move buttons
          const isHero = id === 'hero';
          const posInReorderable = (reorderableVisible as string[]).indexOf(id);

          return (
            <div
              key={id}
              className="w-full rounded-2xl transition-all"
              style={
                isEditing
                  ? {
                      border: '1.5px dashed color-mix(in srgb, var(--dome-accent, var(--accent)) 35%, var(--dome-border, var(--border)))',
                      boxShadow: '0 0 0 3px color-mix(in srgb, var(--dome-accent, var(--accent)) 5%, transparent)',
                    }
                  : undefined
              }
            >
              {/* Section edit bar */}
              {isEditing && !isHero ? (
                <div
                  className="flex cursor-default items-center justify-between gap-2 rounded-t-2xl px-3 py-2"
                  style={{
                    background: 'color-mix(in srgb, var(--dome-accent, var(--accent)) 5%, var(--dome-surface, var(--bg-secondary)))',
                    borderBottom: '1px solid color-mix(in srgb, var(--dome-accent, var(--accent)) 18%, var(--dome-border, var(--border)))',
                  }}
                >
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: 'var(--dome-accent, var(--accent))' }}
                  >
                    <GripVertical className="h-3.5 w-3.5 opacity-60" aria-hidden />
                    {t(`dashboard.layout_label_${id}`)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded-lg p-1 transition-colors disabled:opacity-25"
                      disabled={posInReorderable <= 0}
                      onClick={() => moveSection(id as DashboardLayoutWidgetId, -1)}
                      aria-label={t('dashboard.move_up')}
                      style={{ color: 'var(--dome-text-secondary)', border: '1px solid var(--dome-border)' }}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded-lg p-1 transition-colors disabled:opacity-25"
                      disabled={posInReorderable >= reorderableVisible.length - 1}
                      onClick={() => moveSection(id as DashboardLayoutWidgetId, 1)}
                      aria-label={t('dashboard.move_down')}
                      style={{ color: 'var(--dome-text-secondary)', border: '1px solid var(--dome-border)' }}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    {canHide && (
                      <button
                        type="button"
                        onClick={() => hideSection(id as DashboardLayoutWidgetId)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors"
                        style={{
                          color: 'var(--dome-text-secondary)',
                          border: '1px solid var(--dome-border)',
                          background: 'var(--dome-bg, var(--bg))',
                        }}
                      >
                        <EyeOff className="h-3 w-3" aria-hidden />
                        {t('dashboard.hide_widget')}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Section content */}
              <div>{node}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
