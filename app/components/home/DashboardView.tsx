import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import type { ActivityItem, PendingTodayItem } from '@/lib/hooks/useDashboardData';
import type { DailyGoalId } from '@/lib/hooks/dashboardGamification';
import { showToast } from '@/lib/store/useToastStore';
import type { HomeQuickActionId } from '@/types';
import { DashboardCanvas } from '@/components/home/dashboard/DashboardCanvas';
import { EditorialHero } from '@/components/home/dashboard/editorial/EditorialHero';
import { DailyGoals } from '@/components/home/dashboard/editorial/DailyGoals';
import { TodayBrief } from '@/components/home/dashboard/editorial/TodayBrief';
import { ActivityHeatmap } from '@/components/home/dashboard/editorial/ActivityHeatmap';
import { TodayColumns } from '@/components/home/dashboard/editorial/TodayColumns';
import { PulseStats } from '@/components/home/dashboard/editorial/PulseStats';
import { HomeSearchBar } from '@/components/home/dashboard/editorial/HomeSearchBar';
import { EditorialQuickActions } from '@/components/home/dashboard/editorial/EditorialQuickActions';
import { ContinueActivityList } from '@/components/home/dashboard/editorial/ContinueActivityList';

const QUICK_KBD: Record<string, HomeQuickActionId> = {
  n: 'newNote',
  u: 'upload',
  c: 'newChat',
  l: 'learn',
  g: 'calendar',
};

export default function DashboardView() {
  const { t } = useTranslation();
  const { name } = useUserStore();
  const activeTabId = useTabStore((s) => s.activeTabId);
  const {
    openResourceTab,
    openFolderTab,
    openCalendarTab,
    openChatTab,
    openLearnTab,
    openAgentsTab,
  } = useTabStore(
    (s) => ({
      openResourceTab: s.openResourceTab,
      openFolderTab: s.openFolderTab,
      openCalendarTab: s.openCalendarTab,
      openChatTab: s.openChatTab,
      openLearnTab: s.openLearnTab,
      openAgentsTab: s.openAgentsTab,
    }),
    shallow,
  );
  const currentProject = useAppStore((s) => s.currentProject);
  const homeDashboard = useAppStore((s) => s.homeDashboard);
  const updateHomeDashboard = useAppStore((s) => s.updateHomeDashboard);

  const {
    stats,
    statsDeltas,
    activity,
    gamification,
    activityDayCounts,
    pendingToday,
    loading,
  } = useDashboardData(currentProject?.id ?? 'default');

  const [isEditing, setIsEditing] = useState(false);

  const firstName = name?.split(' ')[0] || '';
  const widgets = homeDashboard.widgets;
  const appearance = homeDashboard.appearance;
  const quickActionsOrder = homeDashboard.quickActions;

  const visibleIds = useMemo(() => {
    const s = new Set<string>(['hero']);
    if (widgets.dailyGoals) s.add('dailyGoals');
    if (widgets.pendingToday || widgets.weeklyActivity) s.add('todayColumns');
    if (widgets.momentum) s.add('momentum');
    if (widgets.search) s.add('search');
    if (quickActionsOrder.length > 0) s.add('quickActions');
    if (widgets.continueActivity) s.add('continueActivity');
    return s;
  }, [widgets, quickActionsOrder]);

  const shellAttrs = useMemo(
    () => ({
      'data-home-layout': appearance.layout,
      'data-home-width': appearance.width,
      'data-home-density': appearance.density,
      'data-home-hero': appearance.heroStyle,
      'data-home-edit': isEditing ? 'true' : 'false',
    }),
    [appearance, isEditing],
  );

  const handleResourceSelect = useCallback(
    (resource: { id: string; type: string; title: string }) => {
      if (resource.type === 'folder') {
        openFolderTab(resource.id, resource.title);
      } else {
        openResourceTab(resource.id, resource.type, resource.title);
      }
    },
    [openResourceTab, openFolderTab],
  );

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const res = {
      id: `res_${now}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'note' as const,
      title: t('dashboard.untitled_note'),
      content: '',
      project_id: currentProject?.id ?? 'default',
      created_at: now,
      updated_at: now,
    };
    const result = await window.electron.db.resources.create(res);
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title);
    }
  }, [currentProject?.id, t, openResourceTab]);

  const handleUpload = useCallback(async () => {
    if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
    const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
    if (!paths?.length) return;
    const result = await window.electron.resource.importMultiple(paths, currentProject?.id ?? 'default');
    if (result?.errors?.length) {
      const duplicateCount = result.errors.filter((entry) => entry.error === 'duplicate').length;
      if (duplicateCount > 0) {
        showToast('warning', `${duplicateCount} archivo(s) ya existían en la biblioteca.`);
      }
    }
  }, [currentProject?.id]);

  const handleNewChat = useCallback(async () => {
    const sessionId = `session_${Date.now()}`;
    openChatTab(sessionId, 'Chat');
  }, [openChatTab]);

  const onQuickAction = useCallback(
    (id: HomeQuickActionId) => {
      switch (id) {
        case 'newNote':
          void handleNewNote();
          return;
        case 'upload':
          void handleUpload();
          return;
        case 'newChat':
          void handleNewChat();
          return;
        case 'learn':
          openLearnTab();
          return;
        case 'calendar':
          openCalendarTab();
          return;
        default:
          return;
      }
    },
    [handleNewNote, handleUpload, handleNewChat, openLearnTab, openCalendarTab],
  );

  const onPendingClick = useCallback(
    (item: PendingTodayItem) => {
      if (item.kind === 'flashcards') {
        openLearnTab();
        return;
      }
      if (item.kind === 'calendar') {
        openCalendarTab();
        return;
      }
      openAgentsTab();
    },
    [openLearnTab, openCalendarTab, openAgentsTab],
  );

  const onContinueActivity = useCallback(
    (item: ActivityItem) => {
      if (item.kind === 'resource' && item.resourceId && item.resourceType) {
        if (item.resourceType === 'folder') {
          openFolderTab(item.resourceId, item.title);
        } else {
          openResourceTab(item.resourceId, item.resourceType, item.title);
        }
        return;
      }
      if (item.kind === 'chat' && item.sessionId) {
        openChatTab(item.sessionId, item.title || t('dashboard.action_new_chat'));
      }
    },
    [openFolderTab, openResourceTab, openChatTab, t],
  );

  const onGoalClick = useCallback(
    (id: DailyGoalId) => {
      if (id === 'write') {
        void handleNewNote();
        return;
      }
      if (id === 'think') {
        void handleNewChat();
        return;
      }
      openAgentsTab();
    },
    [handleNewNote, handleNewChat, openAgentsTab],
  );

  const onAskMany = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
  }, []);

  useEffect(() => {
    if (activeTabId !== 'home') return undefined;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const action = QUICK_KBD[e.key.toLowerCase()];
      if (action) {
        e.preventDefault();
        onQuickAction(action);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTabId, onQuickAction]);

  return (
    <div className="home-shell" {...shellAttrs}>
      <div className="home-scroll">
        <div className="home-canvas">
          {isEditing ? (
            <div className="edit-toolbar">
              <span>{t('dashboard.edit_toolbar_hint')}</span>
              <span className="spacer" />
              <button type="button" className="h-pill-btn primary" onClick={() => setIsEditing(false)}>
                {t('dashboard.edit_mode_done')}
              </button>
            </div>
          ) : null}

          <DashboardCanvas
            isEditing={isEditing}
            preferences={homeDashboard}
            onUpdatePreferences={updateHomeDashboard}
            visibleIds={visibleIds}
            slots={{
              hero: (
                <EditorialHero
                  nameFirst={firstName}
                  gamification={gamification}
                  loading={loading}
                  isEditing={isEditing}
                  onStartCustomize={() => setIsEditing(true)}
                  onDoneEditing={() => setIsEditing(false)}
                  onAskMany={onAskMany}
                />
              ),
              dailyGoals: widgets.dailyGoals ? (
                <DailyGoals gamification={gamification} loading={loading} onGoalClick={onGoalClick} />
              ) : undefined,
              todayColumns:
                widgets.pendingToday || widgets.weeklyActivity ? (
                  <TodayColumns
                    left={
                      widgets.pendingToday ? (
                        <TodayBrief items={pendingToday} loading={loading} onItemClick={onPendingClick} />
                      ) : undefined
                    }
                    right={
                      widgets.weeklyActivity ? (
                        <ActivityHeatmap activityDayCounts={activityDayCounts} loading={loading} />
                      ) : undefined
                    }
                  />
                ) : undefined,
              momentum: widgets.momentum ? (
                <PulseStats
                  stats={stats}
                  deltas={statsDeltas}
                  loading={loading}
                  onOpenAnalytics={openAgentsTab}
                />
              ) : undefined,
              search: widgets.search ? (
                <HomeSearchBar onResourceSelect={handleResourceSelect} />
              ) : undefined,
              quickActions:
                quickActionsOrder.length > 0 ? (
                  <EditorialQuickActions
                    orderedIds={quickActionsOrder}
                    onAction={onQuickAction}
                    onManage={() => setIsEditing(true)}
                  />
                ) : undefined,
              continueActivity: widgets.continueActivity ? (
                <ContinueActivityList
                  activity={activity}
                  loading={loading}
                  onContinue={onContinueActivity}
                  onViewAll={() => openFolderTab(currentProject?.id ?? 'default', currentProject?.name ?? 'Home')}
                />
              ) : undefined,
            }}
          />
        </div>
      </div>
    </div>
  );
}
