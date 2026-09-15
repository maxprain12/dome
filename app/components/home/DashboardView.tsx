import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, Search01Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { useManyStore } from '@/lib/store/useManyStore';
import {
  useDashboardData,
  type ActivityItem,
  type PendingTodayItem,
} from '@/lib/hooks/useDashboardData';
import { db, type Project } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { formatDistanceToNow } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { DashboardAreaChart, type DashboardChartRange } from '@/components/shared/dashboard/DashboardAreaChart';
import { DashboardDataTable } from '@/components/shared/dashboard/DashboardDataTable';
import { DashboardSectionCards } from '@/components/shared/dashboard/DashboardSectionCards';
import { buildActivityChartPoints } from '@/components/shared/dashboard/activityChart';
import { HubToolbar } from '@/components/hub/HubToolbar';

type HomeTableTab = 'activity' | 'pending' | 'projects';

type HomeTableRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  when: string;
  tab: HomeTableTab;
};

export default function DashboardView() {
  const { t } = useTranslation();
  const { name } = useUserStore();
  const currentProject = useAppStore((state) => state.currentProject);
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const setManyOpen = useManyStore((s) => s.setOpen);
  const {
    openResourceTab,
    openFolderTab,
    openCalendarTab,
    openChatTab,
    openProjectsTab,
    openLearnTab,
    openAgentsTab,
  } = useTabStore(
    useShallow((state) => ({
      openResourceTab: state.openResourceTab,
      openFolderTab: state.openFolderTab,
      openCalendarTab: state.openCalendarTab,
      openChatTab: state.openChatTab,
      openProjectsTab: state.openProjectsTab,
      openLearnTab: state.openLearnTab,
      openAgentsTab: state.openAgentsTab,
    })),
  );

  const {
    stats,
    statsDeltas,
    activity,
    pendingToday,
    gamification,
    activityDayCounts,
    loading,
  } = useDashboardData(currentProject?.id ?? 'default');

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [chartRange, setChartRange] = useState<DashboardChartRange>('30d');
  const [tableTab, setTableTab] = useState<HomeTableTab>('activity');
  const firstName = name?.split(' ')[0] || '';

  useEffect(() => {
    let cancelled = false;
    void db.getProjects().then((result) => {
      if (!cancelled && result.success && result.data) {
        setRecentProjects(
          [...result.data].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCommandPalette = useCallback(() => {
    globalThis.dispatchEvent(new CustomEvent('dome:open-command-palette'));
  }, []);

  const handleAskMany = useCallback(() => {
    setManyOpen(true);
    openChatTab(`session_${Date.now()}`, t('dashboard.ask_many_short'));
  }, [openChatTab, setManyOpen, t]);

  const handleNewNote = useCallback(async () => {
    if (!window.electron?.db?.resources?.create) return;
    const now = Date.now();
    const projectId = currentProject?.id ?? 'default';
    const result = await window.electron.db.resources.create({
      id: `res_${now}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'note',
      title: t('dashboard.untitled_note'),
      content: '',
      project_id: projectId,
      created_at: now,
      updated_at: now,
    });
    if (result.success && result.data) {
      openResourceTab(result.data.id, 'note', result.data.title, projectId);
    }
  }, [currentProject?.id, openResourceTab, t]);

  const handleUpload = useCallback(async () => {
    const paths = await window.electron?.selectFiles?.({
      properties: ['openFile', 'multiSelections'],
    });
    if (!paths?.length || !window.electron?.resource?.importMultiple) return;
    const result = await window.electron.resource.importMultiple(
      paths,
      currentProject?.id ?? 'default',
    );
    if (result?.errors?.length) {
      showToast(
        'warning',
        t('common.partial_success', 'Algunos archivos no se pudieron importar.'),
      );
    }
  }, [currentProject?.id, t]);

  const openActivity = useCallback(
    (item: ActivityItem) => {
      const projectId = currentProject?.id;
      if (item.kind === 'resource' && item.resourceId && item.resourceType) {
        if (item.resourceType === 'folder') {
          openFolderTab(item.resourceId, item.title, undefined, projectId);
        } else {
          openResourceTab(item.resourceId, item.resourceType, item.title, projectId);
        }
      } else if (item.sessionId) {
        openChatTab(item.sessionId, item.title);
      }
    },
    [currentProject?.id, openChatTab, openFolderTab, openResourceTab],
  );

  const openPending = useCallback(
    (item: PendingTodayItem) => {
      if (item.kind === 'flashcards') openLearnTab();
      else if (item.kind === 'calendar') openCalendarTab();
      else openAgentsTab();
    },
    [openAgentsTab, openCalendarTab, openLearnTab],
  );

  const chartData = useMemo(
    () => buildActivityChartPoints(activityDayCounts, chartRange),
    [activityDayCounts, chartRange],
  );

  const activityRows: HomeTableRow[] = useMemo(
    () =>
      activity.slice(0, 20).map((item) => ({
        id: item.id,
        title: item.title,
        type:
          item.kind === 'chat'
            ? t('dashboard.activity_kind_chat')
            : item.subtitle || item.resourceType || t('dashboard.activity'),
        status: item.kind === 'chat' ? t('dashboard.activity_kind_chat') : item.resourceType || '',
        when: formatDistanceToNow(item.timestamp),
        tab: 'activity',
      })),
    [activity, t],
  );

  const pendingRows: HomeTableRow[] = useMemo(
    () =>
      pendingToday.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.subtitle || item.kind,
        status: item.tag || item.timeLabel || '',
        when: item.timeLabel || formatDistanceToNow(item.timestamp),
        tab: 'pending',
      })),
    [pendingToday],
  );

  const projectRows: HomeTableRow[] = useMemo(
    () =>
      recentProjects.map((project) => ({
        id: project.id,
        title: project.name,
        type: project.description || t('projects.vault_default_hint'),
        status: project.id === currentProject?.id ? t('projects.active') : '',
        when: formatDistanceToNow(project.updated_at),
        tab: 'projects',
      })),
    [currentProject?.id, recentProjects, t],
  );

  const tableRows =
    tableTab === 'activity' ? activityRows : tableTab === 'pending' ? pendingRows : projectRows;

  const emptyTitle =
    tableTab === 'activity'
      ? t('dashboard.table_empty_activity')
      : tableTab === 'pending'
        ? t('dashboard.table_empty_pending')
        : t('dashboard.table_empty_projects');

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden" data-tab-loading={loading ? '' : undefined}>
      <HubToolbar>
        <Button type="button" size="sm" variant="outline" onClick={openCommandPalette}>
          <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
          {t('dashboard.search_placeholder')}
          <Kbd>⌘K</Kbd>
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void handleUpload().catch(() => {});
            }}
          >
            {t('dashboard.action_upload')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleAskMany}
          >
            <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
            {t('dashboard.ask_many')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleNewNote().catch(() => {});
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('dashboard.action_new_note')}
          </Button>
        </div>
      </HubToolbar>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-8">
          <DashboardSectionCards
            items={[
              {
                id: 'resources',
                label: t('dashboard.stat_resources'),
                value: loading ? '—' : stats.resourceCount,
                delta: statsDeltas.resources,
                footer: firstName || undefined,
                hint: t('dashboard.section_weekly'),
              },
              {
                id: 'chats',
                label: t('dashboard.stat_chats'),
                value: loading ? '—' : stats.recentChats,
                delta: statsDeltas.chats,
                hint: t('dashboard.section_weekly'),
              },
              {
                id: 'runs',
                label: t('dashboard.stat_runs'),
                value: loading ? '—' : stats.activeRuns,
                delta: statsDeltas.activeRuns,
                footer: t('dashboard.energy_card_label'),
                hint: `${Math.round(gamification.momentumPercent)}%`,
              },
              {
                id: 'pending',
                label: t('dashboard.pending_today'),
                value: loading ? '—' : gamification.pendingTodayCount,
                delta: statsDeltas.dueCards,
                hint: t('dashboard.today_sub'),
              },
            ]}
          />

          <DashboardAreaChart
            title={t('dashboard.chart_title')}
            description={t('dashboard.section_weekly')}
            data={chartData}
            range={chartRange}
            onRangeChange={setChartRange}
            valueLabel={t('dashboard.chart_activity_label')}
            rangeLabels={{
              '7d': t('dashboard.chart_range_7d'),
              '30d': t('dashboard.chart_range_30d'),
              '90d': t('dashboard.chart_range_90d'),
            }}
          />

          <DashboardDataTable
            tabs={[
              { id: 'activity', label: t('dashboard.tab_activity'), count: activityRows.length },
              { id: 'pending', label: t('dashboard.tab_pending'), count: pendingRows.length },
              { id: 'projects', label: t('dashboard.tab_projects'), count: projectRows.length },
            ]}
            tab={tableTab}
            onTabChange={(next) => {
              if (next === 'activity' || next === 'pending' || next === 'projects') {
                setTableTab(next);
              }
            }}
            columns={[
              { id: 'title', header: t('dashboard.col_title'), cell: (row) => <span className="block truncate">{row.title}</span> },
              { id: 'type', header: t('dashboard.col_type'), cell: (row) => row.type, className: 'hidden md:table-cell' },
              {
                id: 'status',
                header: t('dashboard.col_status'),
                cell: (row) =>
                  row.status ? <Badge variant="outline">{row.status}</Badge> : null,
              },
              { id: 'when', header: t('dashboard.col_when'), cell: (row) => row.when, className: 'hidden sm:table-cell' },
            ]}
            rows={tableRows}
            loading={loading}
            emptyTitle={emptyTitle}
            onRowClick={(row) => {
              if (row.tab === 'activity') {
                const item = activity.find((entry) => entry.id === row.id);
                if (item) openActivity(item);
                return;
              }
              if (row.tab === 'pending') {
                const item = pendingToday.find((entry) => entry.id === row.id);
                if (item) openPending(item);
                return;
              }
              const project = recentProjects.find((entry) => entry.id === row.id);
              if (project) setCurrentProject(project);
              else openProjectsTab();
            }}
          />
        </div>
      </div>
    </main>
  );
}
