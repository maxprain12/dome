import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  Upload,
  MessageSquarePlus,
  WalletCards,
  Calendar,
  Zap,
  Activity,
  CalendarClock,
  Search,
  PlayCircle,
  GripVertical,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HomeDashboardPreferences, HomeQuickActionId } from '@/types';
import { DEFAULT_HOME_DASHBOARD_PREFERENCES } from '@/types';
import { normalizeHomeDashboardPreferences } from '@/lib/settings/home-dashboard';

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

type WidgetKey = keyof HomeDashboardPreferences['widgets'];

const WIDGET_ICONS: Record<WidgetKey, LucideIcon> = {
  momentum: Zap,
  weeklyActivity: Activity,
  pendingToday: CalendarClock,
  search: Search,
  continueActivity: PlayCircle,
};

export function HomeCustomizeModal({
  isOpen,
  preferences,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  preferences: HomeDashboardPreferences;
  onClose: () => void;
  onSave: (next: HomeDashboardPreferences) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<HomeDashboardPreferences>(preferences);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft({
        quickActions: [...preferences.quickActions],
        widgets: { ...preferences.widgets },
      });
    }
  }, [isOpen, preferences]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const move = (index: number, dir: -1 | 1) => {
    setDraft((d) => {
      const next = [...d.quickActions];
      const j = index + dir;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, quickActions: next };
    });
  };

  const toggleAction = (id: HomeQuickActionId) => {
    setDraft((d) => {
      const has = d.quickActions.includes(id);
      if (has) {
        if (d.quickActions.length <= 1) return d;
        return { ...d, quickActions: d.quickActions.filter((x) => x !== id) };
      }
      return { ...d, quickActions: [...d.quickActions, id] };
    });
  };

  const toggleWidget = (key: WidgetKey) => {
    setDraft((d) => ({
      ...d,
      widgets: { ...d.widgets, [key]: !d.widgets[key] },
    }));
  };

  const handleSave = async () => {
    if (draft.quickActions.length === 0) return;
    setSaving(true);
    try {
      const normalized = normalizeHomeDashboardPreferences(draft);
      await onSave(normalized);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex cursor-default items-center justify-center p-4"
      style={{ background: 'rgba(15,18,28,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="home-customize-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl cursor-auto overflow-y-auto rounded-2xl border shadow-xl"
        style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 id="home-customize-title" className="text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('dashboard.customize_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 transition-colors hover:opacity-80"
            style={{ color: 'var(--dome-text-muted)' }}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-6 p-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-secondary)' }}>
              {t('dashboard.customize_quick_actions')}
            </p>
            <p className="mb-3 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('dashboard.customize_quick_actions_help')}
            </p>
            <ul className="space-y-2">
              {draft.quickActions.map((id, index) => {
                const Icon = ACTION_ICONS[id];
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors"
                    style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab" style={{ color: 'var(--dome-text-muted)' }} />
                      <input
                        type="checkbox"
                        checked
                        onChange={() => toggleAction(id)}
                        className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                        style={{ accentColor: 'var(--dome-accent)' }}
                      />
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: 'var(--dome-bg)', color: 'var(--dome-accent)' }}>
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        <span className="truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                          {t(`dashboard.action_label_${id}`)}
                        </span>
                      </div>
                    </label>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label={t('dashboard.move_up')}
                      >
                        <ChevronUp className="h-4 w-4" style={{ color: 'var(--dome-text-secondary)' }} />
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer rounded-md p-1.5 transition-colors hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
                        disabled={index === draft.quickActions.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={t('dashboard.move_down')}
                      >
                        <ChevronDown className="h-4 w-4" style={{ color: 'var(--dome-text-secondary)' }} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 space-y-2">
              {ALL_QUICK_IDS.filter((id) => !draft.quickActions.includes(id)).map((id) => {
                const Icon = ACTION_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, quickActions: [...d.quickActions, id] }))}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-bg)', color: 'var(--dome-text-secondary)' }}
                  >
                    <Plus className="h-4 w-4" />
                    <Icon className="h-4 w-4" />
                    <span>{t(`dashboard.action_label_${id}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-secondary)' }}>
              {t('dashboard.customize_widgets')}
            </p>
            <p className="mb-3 text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('dashboard.customize_widgets_help')}
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(DEFAULT_HOME_DASHBOARD_PREFERENCES.widgets) as WidgetKey[]).map((key) => {
                const Icon = WIDGET_ICONS[key];
                return (
                  <li key={key}>
                    <label
                      className="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition-colors hover:opacity-90"
                      style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}
                    >
                      <input
                        type="checkbox"
                        checked={draft.widgets[key]}
                        onChange={() => toggleWidget(key)}
                        className="h-4 w-4 rounded border-gray-400 text-indigo-600 focus:ring-indigo-500"
                        style={{ accentColor: 'var(--dome-accent)' }}
                      />
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: 'var(--dome-bg)', color: 'var(--dome-accent)' }}>
                          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        <span className="text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                          {t(`dashboard.widget_${key}`)}
                        </span>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl border px-4 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--dome-border)', color: 'var(--dome-text)' }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={saving || draft.quickActions.length === 0}
            onClick={() => void handleSave()}
            className="cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--dome-accent)' }}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
