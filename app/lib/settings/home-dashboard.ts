import type {
  DashboardLayoutItem,
  DashboardLayoutWidgetId,
  HomeDashboardPreferences,
  HomeDashboardWidgets,
  HomeQuickActionId,
} from '@/types';
import {
  DASHBOARD_LAYOUT_WIDGET_IDS,
  DEFAULT_HOME_DASHBOARD_PREFERENCES,
  DEFAULT_HOME_QUICK_ACTIONS,
  DEFAULT_HOME_WIDGETS,
} from '@/types';

const VALID_QUICK_ACTIONS = new Set<HomeQuickActionId>([
  'newNote',
  'upload',
  'newChat',
  'learn',
  'calendar',
]);

const VALID_LAYOUT_IDS = new Set<string>(DASHBOARD_LAYOUT_WIDGET_IDS);

const DEFAULT_LAYOUT_BY_ID = new Map(
  DEFAULT_HOME_DASHBOARD_PREFERENCES.layout.map((item) => [item.i, item]),
);

function clampInt(n: number, min: number, max?: number): number {
  const x = Math.floor(n);
  if (max !== undefined) return Math.max(min, Math.min(max, x));
  return Math.max(min, x);
}

function normalizeLayout(raw: unknown): DashboardLayoutItem[] {
  const defaults = DEFAULT_HOME_DASHBOARD_PREFERENCES.layout;
  if (!Array.isArray(raw)) {
    return defaults.map((item) => ({ ...item }));
  }

  const out: DashboardLayoutItem[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as Record<string, unknown>;
    const i = typeof o.i === 'string' ? o.i : '';
    if (!VALID_LAYOUT_IDS.has(i) || seen.has(i)) continue;
    seen.add(i);

    const d = DEFAULT_LAYOUT_BY_ID.get(i);
    const x = typeof o.x === 'number' && Number.isFinite(o.x) ? clampInt(o.x, 0) : (d?.x ?? 0);
    const y = typeof o.y === 'number' && Number.isFinite(o.y) ? clampInt(o.y, 0) : (d?.y ?? 0);
    let w = typeof o.w === 'number' && Number.isFinite(o.w) ? clampInt(o.w, 1) : (d?.w ?? 1);
    let h = typeof o.h === 'number' && Number.isFinite(o.h) ? clampInt(o.h, 1) : (d?.h ?? 1);

    const minW =
      typeof o.minW === 'number' && Number.isFinite(o.minW)
        ? clampInt(o.minW, 1)
        : d?.minW;
    const minH =
      typeof o.minH === 'number' && Number.isFinite(o.minH)
        ? clampInt(o.minH, 1)
        : d?.minH;
    const maxW =
      typeof o.maxW === 'number' && Number.isFinite(o.maxW) ? clampInt(o.maxW, 1) : d?.maxW;
    const maxH =
      typeof o.maxH === 'number' && Number.isFinite(o.maxH) ? clampInt(o.maxH, 1) : d?.maxH;

    if (minW !== undefined) w = Math.max(w, minW);
    if (minH !== undefined) h = Math.max(h, minH);
    if (maxW !== undefined) w = Math.min(w, maxW);
    if (maxH !== undefined) h = Math.min(h, maxH);

    out.push({
      i,
      x,
      y,
      w,
      h,
      minW,
      minH,
      maxW,
      maxH,
      static: i === 'hero',
    });
  }

  for (const d of defaults) {
    if (!seen.has(d.i)) {
      out.push({ ...d });
    }
  }

  // Hero always gets y=0 so it is always rendered first.
  const hero = out.find((l) => l.i === 'hero');
  if (hero) hero.y = 0;

  const order = new Map(DASHBOARD_LAYOUT_WIDGET_IDS.map((id, idx) => [id, idx]));
  out.sort((a, b) => (order.get(a.i as DashboardLayoutWidgetId) ?? 99) - (order.get(b.i as DashboardLayoutWidgetId) ?? 99));

  return out;
}

export function normalizeHomeDashboardPreferences(
  raw: unknown,
): HomeDashboardPreferences {
  const base = {
    quickActions: [...DEFAULT_HOME_DASHBOARD_PREFERENCES.quickActions],
    widgets: { ...DEFAULT_HOME_DASHBOARD_PREFERENCES.widgets },
    layout: DEFAULT_HOME_DASHBOARD_PREFERENCES.layout.map((item) => ({ ...item })),
  };

  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const o = raw as Record<string, unknown>;

  let quickActions: HomeQuickActionId[] = [...DEFAULT_HOME_QUICK_ACTIONS];
  if (Array.isArray(o.quickActions)) {
    const seen = new Set<string>();
    const next: HomeQuickActionId[] = [];
    for (const id of o.quickActions) {
      if (typeof id !== 'string' || !VALID_QUICK_ACTIONS.has(id as HomeQuickActionId)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id as HomeQuickActionId);
    }
    if (next.length > 0) {
      quickActions = next;
    }
  }

  let widgets: HomeDashboardWidgets = { ...DEFAULT_HOME_WIDGETS };
  if (o.widgets && typeof o.widgets === 'object') {
    const w = o.widgets as Record<string, unknown>;
    widgets = {
      momentum: typeof w.momentum === 'boolean' ? w.momentum : DEFAULT_HOME_WIDGETS.momentum,
      weeklyActivity:
        typeof w.weeklyActivity === 'boolean' ? w.weeklyActivity : DEFAULT_HOME_WIDGETS.weeklyActivity,
      pendingToday:
        typeof w.pendingToday === 'boolean' ? w.pendingToday : DEFAULT_HOME_WIDGETS.pendingToday,
      search: typeof w.search === 'boolean' ? w.search : DEFAULT_HOME_WIDGETS.search,
      continueActivity:
        typeof w.continueActivity === 'boolean'
          ? w.continueActivity
          : DEFAULT_HOME_WIDGETS.continueActivity,
    };
  }

  const layout = normalizeLayout(o.layout);

  return { quickActions, widgets, layout };
}

function layoutItemsEqual(a: DashboardLayoutItem[], b: DashboardLayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!y || x.i !== y.i || x.x !== y.x || x.y !== y.y || x.w !== y.w || x.h !== y.h) return false;
    if (Boolean(x.static) !== Boolean(y.static)) return false;
    if (x.minW !== y.minW || x.minH !== y.minH || x.maxW !== y.maxW || x.maxH !== y.maxH) return false;
  }
  return true;
}

/** Fusiona posiciones del grid visible con el layout guardado (incluye widgets ocultos). */
export function mergeLayoutAfterGridChange(
  prevSaved: DashboardLayoutItem[],
  gridLayout: ReadonlyArray<{
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    static?: boolean;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  }>,
  visibleIds: ReadonlySet<string>,
): DashboardLayoutItem[] {
  const gridMap = new Map(gridLayout.map((l) => [l.i, l]));
  const prevMap = new Map(prevSaved.map((l) => [l.i, l]));

  const result: DashboardLayoutItem[] = [];

  for (const id of DASHBOARD_LAYOUT_WIDGET_IDS) {
    const d = DEFAULT_LAYOUT_BY_ID.get(id);
    const prev = prevMap.get(id);
    const base: DashboardLayoutItem = prev ?? d ?? { i: id, x: 0, y: 0, w: 4, h: 4 };

    if (!visibleIds.has(id)) {
      result.push({
        ...base,
        i: id,
        static: id === 'hero',
      });
      continue;
    }

    const g = gridMap.get(id);
    if (!g) {
      result.push({ ...base, i: id, static: id === 'hero' });
      continue;
    }

    result.push({
      i: id,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      minW: base.minW,
      minH: base.minH,
      maxW: base.maxW,
      maxH: base.maxH,
      static: id === 'hero',
    });
  }

  return normalizeLayout(result);
}

export function dashboardLayoutsEqual(a: DashboardLayoutItem[], b: DashboardLayoutItem[]): boolean {
  return layoutItemsEqual(normalizeLayout(a), normalizeLayout(b));
}

export function serializeHomeDashboardPreferences(prefs: HomeDashboardPreferences): string {
  return JSON.stringify({
    quickActions: prefs.quickActions,
    widgets: prefs.widgets,
    layout: prefs.layout,
  });
}
