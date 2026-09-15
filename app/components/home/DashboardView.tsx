import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon, Search01Icon, SparklesIcon, Folder01Icon, File01Icon, Message01Icon, RefreshIcon } from '@hugeicons/core-free-icons';
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
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { DashboardWorkspace, type DashboardPanel } from '@/components/shared/dashboard/DashboardWorkspace';
import { DashboardCollection, DashboardRow } from '@/components/shared/dashboard/DashboardCollection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { DashboardAreaChart, type DashboardChartRange } from '@/components/shared/dashboard/DashboardAreaChart';
import { DashboardSectionCards } from '@/components/shared/dashboard/DashboardSectionCards';
import { buildActivityChartPoints } from '@/components/shared/dashboard/activityChart';
import { DashboardAgenda } from './DashboardAgenda';
import { HubToolbar } from '@/components/hub/HubToolbar';

export default function DashboardView() {
  const { t, i18n } = useTranslation();
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
    upcomingEventsList,
    gamification,
    activityDayCounts,
    loading,
    refresh,
  } = useDashboardData(currentProject?.id ?? 'default');

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [chartRange, setChartRange] = useState<DashboardChartRange>('30d');
  const firstName = name?.split(' ')[0] || '';

  useEffect(() => {
    let cancelled = false;
    void db.getProjects().then((result) => {
      if (!cancelled && result.success && result.data) {
        setRecentProjects(
          [...result.data].sort((a, b) => b.updated_at - a.updated_at).slice(0, 8),
        );
      }
    }).catch(() => {
      if (!cancelled) showToast('error', t('dashboardPanels.load_error'));
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

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
    } else {
      showToast('error', t('dashboardPanels.action_error'));
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

  const panels: DashboardPanel[] = [
    { id: 'summary', label: t('dashboardPanels.summary'), wide: true, content: <DashboardSectionCards items={[
      { id: 'resources', label: t('dashboard.stat_resources'), value: loading ? '—' : stats.resourceCount, hint: t('dashboardPanels.resources_hint'), delta: statsDeltas.resources },
      { id: 'chats', label: t('dashboard.stat_chats'), value: loading ? '—' : stats.recentChats, hint: t('dashboardPanels.chats_hint'), delta: statsDeltas.chats },
      { id: 'runs', label: t('dashboard.stat_runs'), value: loading ? '—' : stats.activeRuns, hint: t('dashboardPanels.runs_hint') },
      { id: 'pending', label: t('dashboardPanels.agenda'), value: loading ? '—' : gamification.pendingTodayCount, hint: t('dashboardPanels.agenda_hint') },
    ]} /> },
    { id: 'recent', label: t('dashboardPanels.recent'), content:
      <DashboardCollection title={t('dashboardPanels.recent')} description={t('dashboardPanels.recent_hint')} loading={loading} empty={activity.length === 0} emptyTitle={t('dashboard.table_empty_activity')}>
        {activity.slice(0, 4).map((item) => <DashboardRow key={item.id} title={item.title} detail={formatDistanceToNow(item.timestamp)} marker={<HugeiconsIcon icon={item.kind === 'chat' ? Message01Icon : File01Icon} className="size-5" />} onClick={() => openActivity(item)} />)}
      </DashboardCollection> },
    { id: 'agenda', label: t('dashboardPanels.agenda'), content: <DashboardAgenda events={upcomingEventsList} pending={pendingToday} loading={loading} onCalendar={openCalendarTab} onPending={openPending} /> },
    { id: 'activity', label: t('dashboard.chart_title'), content:
      <DashboardAreaChart title={t('dashboard.chart_title')} description={t('dashboardPanels.activity_hint')} data={chartData} range={chartRange} onRangeChange={setChartRange} valueLabel={t('dashboard.chart_activity_label')} emptyTitle={t('dashboard.table_empty_activity')} rangeLabels={{ '7d': t('dashboard.chart_range_7d'), '30d': t('dashboard.chart_range_30d'), '90d': t('dashboard.chart_range_90d') }} /> },
    { id: 'many', label: t('dashboardPanels.many'), content:
      <Card variant="mint">
        <CardHeader><CardTitle>{t('dashboardPanels.many')}</CardTitle><CardDescription>{t('dashboardPanels.many_hint')}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2"><span className="text-4xl font-semibold tabular-nums">{loading ? '—' : gamification.weeklyRunsCompleted}</span><span className="text-xs text-muted-foreground">{t('dashboardPanels.runs_completed')}</span></div>
          <Button variant="outline" onClick={handleAskMany}><HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />{t('dashboard.ask_many')}</Button>
          <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => openAgentsTab()}>{t('dashboardPanels.agents')}</Button><Button variant="outline" onClick={() => openLearnTab()}>{t('dashboardPanels.learn')}</Button></div>
        </CardContent>
      </Card> },
    { id: 'projects', label: t('dashboard.tab_projects'), wide: true, content:
      <DashboardCollection title={t('dashboard.tab_projects')} description={t('dashboardPanels.projects_hint')} empty={recentProjects.length === 0} emptyTitle={t('dashboard.table_empty_projects')} action={<Button size="sm" variant="ghost" onClick={() => openProjectsTab()}>{t('dashboardPanels.view_all')}</Button>}>
        <div className="grid gap-3 @min-[760px]/dashboard:grid-cols-2">{recentProjects.slice(0, 4).map((project) => <DashboardRow key={project.id} title={project.name} detail={project.description || formatDistanceToNow(project.updated_at)} marker={<HugeiconsIcon icon={Folder01Icon} className="size-5" />} trailing={project.id === currentProject?.id ? <Badge variant="secondary">{t('projects.active')}</Badge> : undefined} onClick={() => { setCurrentProject(project); openFolderTab(project.id, project.name, undefined, project.id); }} />)}</div>
      </DashboardCollection> },
  ];

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
              void handleUpload().catch(() => showToast('error', t('dashboardPanels.action_error')));
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
              void handleNewNote().catch(() => showToast('error', t('dashboardPanels.action_error')));
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
            {t('dashboard.action_new_note')}
          </Button>
        </div>
      </HubToolbar>

      <div className="@container/dashboard min-h-0 flex-1 overflow-y-auto bg-muted/30">
        <DashboardWorkspace scope="home" eyebrow={currentProject?.name || t('sidebar.group_workspace')} title={firstName ? t('dashboardPanels.greeting', { name: firstName }) : t('dashboardPanels.home_title')} description={new Date().toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })} panels={panels} actions={<Button variant="ghost" size="icon-sm" aria-label={t('dashboardPanels.refresh')} disabled={loading} onClick={refresh}><HugeiconsIcon icon={RefreshIcon} /></Button>} />
      </div>
    </main>
  );
}
