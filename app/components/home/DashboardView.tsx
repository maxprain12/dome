import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import type { ActivityItem, PendingTodayItem } from '@/lib/hooks/useDashboardData';
import { InlineSearch } from '@/components/Search/SimpleSearch';
import { showToast } from '@/lib/store/useToastStore';
import type { HomeQuickActionId } from '@/types';
import { DashboardHero } from '@/components/home/dashboard/DashboardHero';
import { DashboardQuickActions } from '@/components/home/dashboard/DashboardQuickActions';
import { DashboardMomentum } from '@/components/home/dashboard/DashboardMomentum';
import { DashboardWeeklyActivity } from '@/components/home/dashboard/DashboardWeeklyActivity';
import { DashboardPending } from '@/components/home/dashboard/DashboardPending';
import { DashboardActivityContinue } from '@/components/home/dashboard/DashboardActivityContinue';
import { HomeCustomizeModal } from '@/components/home/dashboard/HomeCustomizeModal';

export default function DashboardView() {
  const { t } = useTranslation();
  const { name } = useUserStore();
  const {
    openResourceTab,
    openFolderTab,
    openCalendarTab,
    openChatTab,
    openLearnTab,
    openAgentsTab,
  } = useTabStore();
  const currentProject = useAppStore((s) => s.currentProject);
  const homeDashboard = useAppStore((s) => s.homeDashboard);
  const updateHomeDashboard = useAppStore((s) => s.updateHomeDashboard);

  const { stats, activity, gamification, pendingToday, loading } = useDashboardData(
    currentProject?.id ?? 'default',
  );

  const [customizeOpen, setCustomizeOpen] = useState(false);

  const firstName = name?.split(' ')[0] || '';

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

  const widgets = homeDashboard.widgets;
  const quickActionsOrder = homeDashboard.quickActions;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--dome-bg)' }}>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <DashboardHero
          nameFirst={firstName}
          gamification={gamification}
          loading={loading}
          onCustomize={() => setCustomizeOpen(true)}
        />

        {widgets.search ? (
          <div className="mb-8">
            <InlineSearch onResourceSelect={handleResourceSelect} />
          </div>
        ) : null}

        <DashboardQuickActions orderedIds={quickActionsOrder} onAction={onQuickAction} />

        {widgets.momentum ? (
          <DashboardMomentum stats={stats} gamification={gamification} loading={loading} />
        ) : null}

        {widgets.weeklyActivity ? (
          <DashboardWeeklyActivity gamification={gamification} loading={loading} />
        ) : null}

        {widgets.pendingToday ? (
          <DashboardPending items={pendingToday} loading={loading} onItemClick={onPendingClick} />
        ) : null}

        {widgets.continueActivity ? (
          <DashboardActivityContinue activity={activity} loading={loading} onContinue={onContinueActivity} />
        ) : null}
      </div>

      <HomeCustomizeModal
        isOpen={customizeOpen}
        preferences={homeDashboard}
        onClose={() => setCustomizeOpen(false)}
        onSave={updateHomeDashboard}
      />
    </div>
  );
}
