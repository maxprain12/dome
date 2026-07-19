import { useCallback, useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  BookOpen01Icon,
  Calendar03Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  FireIcon,
  Folder01Icon,
  Note01Icon,
  PlusSignIcon,
  Search01Icon,
  SparklesIcon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { Trans, useTranslation } from 'react-i18next';
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
import type { DailyGoalId } from '@/lib/hooks/dashboardGamification';
import { db, type Project } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { cn, formatDistanceToNow } from '@/lib/utils';
import { ActivityHeatmap } from '@/components/home/dashboard/ActivityHeatmap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Kbd } from '@/components/ui/kbd';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return 'dashboard.greeting_late';
  if (h < 12) return 'dashboard.greeting_morning';
  if (h < 18) return 'dashboard.greeting_afternoon';
  return 'dashboard.greeting_evening';
}

/** Button-as-Item rows: override default Button h-7 for a stable list-row layout. */
const LIST_ITEM_BUTTON_CLASS = cn(
  'h-auto min-h-11 w-full flex-nowrap items-center justify-start gap-3',
  'whitespace-normal py-2.5 text-left',
  '[&_[data-slot=item-media]]:self-center [&_[data-slot=item-media]]:translate-y-0',
  '[&_[data-slot=item-actions]]:shrink-0 [&_[data-slot=item-content]]:min-w-0',
);

function formatEyebrowDate(locale: string): { short: string; week: number } {
  const now = new Date();
  const short = now
    .toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(/\./g, '');
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return { short, week };
}

function DeltaBadge({ value }: { value: number }) {
  if (!value) return null;
  const positive = value > 0;
  return (
    <Badge variant={positive ? 'secondary' : 'outline'} className="tabular-nums">
      {positive ? `+${value}` : value}
    </Badge>
  );
}

const GOAL_META: Record<
  DailyGoalId,
  { ribbon: string; title: string; sub: string }
> = {
  write: {
    ribbon: 'dashboard.goal_ribbon_write',
    title: 'dashboard.goal_title_write',
    sub: 'dashboard.goal_sub_write',
  },
  think: {
    ribbon: 'dashboard.goal_ribbon_think',
    title: 'dashboard.goal_title_think',
    sub: 'dashboard.goal_sub_think',
  },
  build: {
    ribbon: 'dashboard.goal_ribbon_build',
    title: 'dashboard.goal_title_build',
    sub: 'dashboard.goal_sub_build',
  },
};

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
    gamification,
    activityDayCounts,
    loading,
  } = useDashboardData(currentProject?.id ?? 'default');

  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const firstName = name?.split(' ')[0] || '';
  const { short: eyebrowDate, week } = useMemo(
    () => formatEyebrowDate(i18n.language),
    [i18n.language],
  );

  useEffect(() => {
    let cancelled = false;
    void db.getProjects().then((result) => {
      if (!cancelled && result.success && result.data) {
        setRecentProjects(
          [...result.data].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new CustomEvent('dome:open-command-palette'));
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

  const handleNewChat = useCallback(() => {
    openChatTab(`session_${Date.now()}`, t('dashboard.action_new_chat'));
  }, [openChatTab, t]);

  const onGoalClick = useCallback(
    (id: DailyGoalId) => {
      switch (id) {
        case 'write':
          void handleNewNote();
          return;
        case 'think':
          handleAskMany();
          return;
        case 'build':
          openAgentsTab();
          return;
        default: {
          const _exhaustive: never = id;
          return _exhaustive;
        }
      }
    },
    [handleAskMany, handleNewNote, openAgentsTab],
  );

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

  const pulseMetrics = [
    {
      label: t('dashboard.stat_resources'),
      value: stats.resourceCount,
      delta: statsDeltas.resources,
    },
    {
      label: t('dashboard.stat_chats'),
      value: stats.recentChats,
      delta: statsDeltas.chats,
    },
    {
      label: t('dashboard.stat_studio'),
      value: stats.studioCount,
      delta: statsDeltas.studioDocs,
    },
    {
      label: t('dashboard.stat_cards'),
      value: stats.dueFlashcards,
      delta: statsDeltas.dueCards,
    },
    {
      label: t('dashboard.stat_events'),
      value: stats.upcomingEvents,
      delta: 0,
    },
    {
      label: t('dashboard.stat_runs'),
      value: stats.activeRuns,
      delta: statsDeltas.activeRuns,
    },
  ] as const;

  const quickActions: Array<{
    id: string;
    title: string;
    desc: string;
    icon: typeof PlusSignIcon;
    onClick: () => void;
    primary?: boolean;
    kbd: string;
  }> = [
    {
      id: 'note',
      title: t('dashboard.action_new_note'),
      desc: t('dashboard.action_new_note_desc'),
      icon: PlusSignIcon,
      onClick: () => void handleNewNote(),
      primary: true,
      kbd: 'N',
    },
    {
      id: 'upload',
      title: t('dashboard.action_upload'),
      desc: t('dashboard.action_upload_desc'),
      icon: Upload04Icon,
      onClick: () => void handleUpload(),
      kbd: 'U',
    },
    {
      id: 'chat',
      title: t('dashboard.action_new_chat'),
      desc: t('dashboard.action_new_chat_desc'),
      icon: Chat01Icon,
      onClick: handleNewChat,
      kbd: 'C',
    },
    {
      id: 'learn',
      title: t('dashboard.action_learn'),
      desc: t('dashboard.action_learn_desc'),
      icon: BookOpen01Icon,
      onClick: openLearnTab,
      kbd: 'L',
    },
    {
      id: 'calendar',
      title: t('dashboard.action_calendar'),
      desc: t('dashboard.action_calendar_desc'),
      icon: Calendar03Icon,
      onClick: openCalendarTab,
      kbd: 'G',
    },
  ];

  return (
    <main className="h-full overflow-y-auto" data-tab-loading={loading ? '' : undefined}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
        {/* Hero */}
        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{eyebrowDate}</span>
              <Separator orientation="vertical" className="h-3" />
              <span>{t('dashboard.week_label', { week })}</span>
              {currentProject?.name ? (
                <>
                  <Separator orientation="vertical" className="h-3" />
                  <span className="truncate">{currentProject.name}</span>
                </>
              ) : null}
            </div>

            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              {t(greetingKey())}
              {firstName ? (
                <>
                  , <span className="text-primary">{firstName}</span>.
                </>
              ) : (
                '.'
              )}
            </h1>

            {loading ? (
              <Skeleton className="h-12 max-w-xl" />
            ) : (
              <p className="max-w-xl text-sm text-muted-foreground">
                <Trans
                  i18nKey="dashboard.hero_narrative"
                  values={{
                    current: gamification.dailyGoalProgress,
                    target: gamification.dailyGoalTarget,
                    energy: Math.round(gamification.momentumPercent),
                    waiting: gamification.pendingTodayCount,
                  }}
                  components={{ b: <b className="font-medium text-foreground" /> }}
                />
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleAskMany}>
                <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
                {t('dashboard.ask_many')}
              </Button>
              <Button type="button" variant="outline" onClick={openCommandPalette}>
                <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
                {t('dashboard.search_placeholder')}
                <Kbd className="ml-1">⌘K</Kbd>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Card size="sm" className="shadow-sm">
              <CardHeader>
                <CardDescription>{t('dashboard.streak_card_label')}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {loading ? '—' : gamification.streakDays}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                <HugeiconsIcon icon={FireIcon} className="size-3.5 text-warning" />
                {t('dashboard.streak_days', { count: gamification.streakDays })}
              </CardContent>
            </Card>
            <Card size="sm" className="shadow-sm">
              <CardHeader>
                <CardDescription>{t('dashboard.energy_card_label')}</CardDescription>
                <CardTitle className="text-2xl tabular-nums">
                  {loading ? '—' : `${Math.round(gamification.momentumPercent)}%`}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Progress value={gamification.momentumPercent}>
                  <ProgressLabel>{t('dashboard.momentum_label')}</ProgressLabel>
                  <ProgressValue />
                </Progress>
                <span className="text-xs text-muted-foreground">
                  {t('dashboard.vs_last_week')}{' '}
                  <span className="tabular-nums text-foreground">
                    {gamification.weeklyEnergyDelta > 0 ? '+' : ''}
                    {gamification.weeklyEnergyDelta}%
                  </span>
                </span>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Daily goals */}
        <section className="flex flex-col gap-3" aria-labelledby="home-goals-heading">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 id="home-goals-heading" className="font-heading text-lg font-semibold">
                {t('dashboard.goal_today')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('dashboard.goal_progress', {
                  current: gamification.dailyGoalProgress,
                  target: gamification.dailyGoalTarget,
                })}
              </p>
            </div>
          </div>
          <div className="grid items-stretch gap-3 sm:grid-cols-3">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-44 rounded-lg" />
                ))
              : gamification.dailyGoals.map((goal) => {
                  const meta = GOAL_META[goal.id];
                  return (
                    <Card
                      key={goal.id}
                      size="sm"
                      className={cn(
                        'h-full cursor-pointer shadow-sm transition-colors hover:bg-muted/40',
                        goal.done && 'ring-primary/30',
                      )}
                      role="button"
                      tabIndex={0}
                      onClick={() => onGoalClick(goal.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onGoalClick(goal.id);
                        }
                      }}
                    >
                      <CardHeader className="flex-none">
                        <CardDescription className="uppercase tracking-wide">
                          {t(meta.ribbon)}
                        </CardDescription>
                        <CardAction className="size-4">
                          {goal.done ? (
                            <HugeiconsIcon
                              icon={CheckmarkCircle02Icon}
                              className="size-4 text-success"
                            />
                          ) : (
                            <span className="block size-4" aria-hidden />
                          )}
                        </CardAction>
                        <CardTitle className="line-clamp-2 min-h-10 leading-5">
                          {t(meta.title)}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
                        <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                          {t(meta.sub)}
                        </p>
                      </CardContent>
                      <CardFooter className="mt-auto flex-none">
                        <Progress value={goal.progress} className="w-full">
                          <ProgressLabel>{goal.progressLabel}</ProgressLabel>
                          <ProgressValue />
                        </Progress>
                      </CardFooter>
                    </Card>
                  );
                })}
          </div>
        </section>

        {/* Pulse */}
        <section aria-label={t('dashboard.section_pulse')}>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t('dashboard.section_pulse')}</h2>
            <p className="text-xs text-muted-foreground">{t('dashboard.section_weekly')}</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y rounded-xl border bg-card md:grid-cols-3 lg:grid-cols-6 md:divide-y-0 lg:divide-y-0">
            {pulseMetrics.map((metric) => (
              <div key={metric.label} className="flex flex-col gap-1.5 p-4">
                {loading ? (
                  <Skeleton className="h-7 w-10" />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold tabular-nums">{metric.value}</span>
                    <DeltaBadge value={metric.delta} />
                  </div>
                )}
                <span className="text-xs text-muted-foreground">{metric.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section className="flex flex-col gap-3" aria-labelledby="home-actions-heading">
          <h2 id="home-actions-heading" className="font-heading text-lg font-semibold">
            {t('dashboard.quick_actions')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {quickActions.map((action) => (
              <Card
                key={action.id}
                size="sm"
                className={cn(
                  'cursor-pointer shadow-sm transition-colors hover:bg-muted/40',
                  action.primary && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
                role="button"
                tabIndex={0}
                onClick={action.onClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    action.onClick();
                  }
                }}
              >
                <CardHeader>
                  <CardAction>
                    <Kbd
                      className={cn(
                        action.primary &&
                          'bg-primary-foreground/15 text-primary-foreground',
                      )}
                    >
                      {action.kbd}
                    </Kbd>
                  </CardAction>
                  <div
                    className={cn(
                      'mb-1 flex size-8 items-center justify-center rounded-md',
                      action.primary ? 'bg-primary-foreground/15' : 'bg-muted',
                    )}
                  >
                    <HugeiconsIcon icon={action.icon} className="size-4" />
                  </div>
                  <CardTitle
                    className={cn(action.primary && 'text-primary-foreground')}
                  >
                    {action.title}
                  </CardTitle>
                  <CardDescription
                    className={cn(
                      action.primary && 'text-primary-foreground/80',
                    )}
                  >
                    {action.desc}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t('dashboard.continue_activity')}</CardTitle>
              <CardDescription>{t('dashboard.continue_activity_desc')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : activity.length ? (
                <ItemGroup className="gap-2">
                  {activity.slice(0, 8).map((item) => (
                    <Item
                      key={item.id}
                      variant="muted"
                      size="sm"
                      className={cn(LIST_ITEM_BUTTON_CLASS, 'hover:bg-muted')}
                      render={<Button type="button" variant="ghost" />}
                      onClick={() => openActivity(item)}
                    >
                      <ItemMedia variant="icon">
                        <HugeiconsIcon
                          icon={item.kind === 'chat' ? Chat01Icon : Note01Icon}
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{item.title}</ItemTitle>
                        <ItemDescription>
                          {item.kind === 'chat'
                            ? t('dashboard.activity_kind_chat')
                            : item.subtitle || item.resourceType || 'resource'}
                          {' · '}
                          {formatDistanceToNow(item.timestamp)}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="text-muted-foreground"
                        />
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              ) : (
                <Empty className="border-0 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HugeiconsIcon icon={Note01Icon} />
                    </EmptyMedia>
                    <EmptyTitle>{t('dashboard.no_recent_activity')}</EmptyTitle>
                    <EmptyDescription>{t('dashboard.no_recent_hint')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t('dashboard.pending_today')}</CardTitle>
                <CardDescription>
                  {t('dashboard.today_sub')}
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">
                    {t('dashboard.today_count', {
                      count: pendingToday.length,
                    })}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : pendingToday.length ? (
                  <ItemGroup className="gap-2">
                    {pendingToday.slice(0, 5).map((item) => (
                      <Item
                        key={item.id}
                        variant="muted"
                        size="sm"
                        className={cn(LIST_ITEM_BUTTON_CLASS, 'hover:bg-muted')}
                        render={<Button type="button" variant="ghost" />}
                        onClick={() => openPending(item)}
                      >
                        <ItemContent>
                          <ItemTitle>{item.title}</ItemTitle>
                          <ItemDescription>
                            {item.subtitle || item.timeLabel}
                          </ItemDescription>
                        </ItemContent>
                        {item.tag ? (
                          <ItemActions>
                            <Badge
                              variant={
                                item.tagKind === 'warn' || item.isNow
                                  ? 'destructive'
                                  : 'outline'
                              }
                            >
                              {item.tag}
                            </Badge>
                          </ItemActions>
                        ) : null}
                      </Item>
                    ))}
                  </ItemGroup>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t('dashboard.pending_empty')}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t('dashboard.section_activity_grid')}</CardTitle>
                <CardDescription>{t('dashboard.section_weekly')}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityHeatmap
                  activityDayCounts={activityDayCounts}
                  loading={loading}
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t('projects.your_projects')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ItemGroup className="gap-2">
                  {recentProjects.map((project) => (
                    <Item
                      key={project.id}
                      variant="muted"
                      size="sm"
                      className={cn(LIST_ITEM_BUTTON_CLASS, 'hover:bg-muted')}
                      render={<Button type="button" variant="ghost" />}
                      onClick={() => setCurrentProject(project)}
                    >
                      <ItemMedia variant="icon">
                        <HugeiconsIcon icon={Folder01Icon} />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{project.name}</ItemTitle>
                        <ItemDescription>
                          {project.description || t('projects.vault_default_hint')}
                        </ItemDescription>
                      </ItemContent>
                      {project.id === currentProject?.id ? (
                        <ItemActions>
                          <Badge variant="secondary">{t('projects.active')}</Badge>
                        </ItemActions>
                      ) : null}
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={openProjectsTab}
                >
                  {t('projects.open_library')}
                  <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
