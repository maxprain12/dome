import type {
  HomeDashboardPreferences,
  HomeDashboardWidgets,
  HomeQuickActionId,
} from '@/types';
import {
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

export function normalizeHomeDashboardPreferences(
  raw: unknown,
): HomeDashboardPreferences {
  const base = {
    quickActions: [...DEFAULT_HOME_DASHBOARD_PREFERENCES.quickActions],
    widgets: { ...DEFAULT_HOME_DASHBOARD_PREFERENCES.widgets },
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

  return { quickActions, widgets };
}

export function serializeHomeDashboardPreferences(prefs: HomeDashboardPreferences): string {
  return JSON.stringify({
    quickActions: prefs.quickActions,
    widgets: prefs.widgets,
  });
}
