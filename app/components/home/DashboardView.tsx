import { useCallback, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  Calendar03Icon,
  Chat01Icon,
  Folder01Icon,
  Note01Icon,
  PlusSignIcon,
  Search01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTabStore } from '@/lib/store/useTabStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useUserStore } from '@/lib/store/useUserStore';
import { useDashboardData, type ActivityItem, type PendingTodayItem } from '@/lib/hooks/useDashboardData';
import { db, type Project } from '@/lib/db/client';
import { showToast } from '@/lib/store/useToastStore';
import { formatDistanceToNow } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardView() {
  const { t } = useTranslation();
  const { name } = useUserStore();
  const currentProject = useAppStore((state) => state.currentProject);
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const {
    openResourceTab,
    openFolderTab,
    openCalendarTab,
    openChatTab,
    openProjectsTab,
  } = useTabStore(
    useShallow((state) => ({
      openResourceTab: state.openResourceTab,
      openFolderTab: state.openFolderTab,
      openCalendarTab: state.openCalendarTab,
      openChatTab: state.openChatTab,
      openProjectsTab: state.openProjectsTab,
    })),
  );
  const { stats, activity, pendingToday, loading } = useDashboardData(currentProject?.id ?? 'default');
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    void db.getProjects().then((result) => {
      if (!cancelled && result.success && result.data) {
        setRecentProjects([...result.data].sort((a, b) => b.updated_at - a.updated_at).slice(0, 4));
      }
    });
    return () => { cancelled = true; };
  }, []);

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
    if (result.success && result.data) openResourceTab(result.data.id, 'note', result.data.title, projectId);
  }, [currentProject?.id, openResourceTab, t]);

  const handleUpload = useCallback(async () => {
    const paths = await window.electron?.selectFiles?.({ properties: ['openFile', 'multiSelections'] });
    if (!paths?.length || !window.electron?.resource?.importMultiple) return;
    const result = await window.electron.resource.importMultiple(paths, currentProject?.id ?? 'default');
    if (result?.errors?.length) showToast('warning', t('common.partial_success', 'Algunos archivos no se pudieron importar.'));
  }, [currentProject?.id, t]);

  const openActivity = useCallback((item: ActivityItem) => {
    const projectId = currentProject?.id;
    if (item.kind === 'resource' && item.resourceId && item.resourceType) {
      if (item.resourceType === 'folder') openFolderTab(item.resourceId, item.title, undefined, projectId);
      else openResourceTab(item.resourceId, item.resourceType, item.title, projectId);
    } else if (item.sessionId) {
      openChatTab(item.sessionId, item.title);
    }
  }, [currentProject?.id, openChatTab, openFolderTab, openResourceTab]);

  const openPending = useCallback((item: PendingTodayItem) => {
    if (item.kind === 'calendar') openCalendarTab();
    else window.dispatchEvent(new CustomEvent('dome:open-command-palette'));
  }, [openCalendarTab]);

  const metrics = [
    [t('projects.resources'), stats.resourceCount],
    [t('projects.chats'), stats.recentChats],
    [t('projects.agenda_7d'), stats.upcomingEvents],
    [t('automationHub.tab_runs'), stats.activeRuns],
  ] as const;

  return (
    <main className="h-full overflow-y-auto" data-tab-loading={loading ? '' : undefined}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
        <PageHeader
          eyebrow={currentProject?.name}
          title={name ? t('dashboard.greeting_name', { name: name.split(' ')[0] }) : t('workspace.home')}
          description={t('dashboard.subtitle', 'Continúa donde lo dejaste o inicia algo nuevo.')}
          actions={
            <Button type="button" variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('dome:open-command-palette'))}>
              <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" />
              {t('command.palette_placeholder')}
              <kbd className="ml-2 text-xs text-muted-foreground">⌘K</kbd>
            </Button>
          }
        />

        <section className="grid grid-cols-2 divide-x divide-y rounded-3xl border bg-card md:grid-cols-4 md:divide-y-0" aria-label={t('dashboard.section_pulse')}>
          {metrics.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1 p-4">
              {loading ? <Skeleton className="h-7 w-10" /> : <span className="text-2xl font-semibold tabular-nums">{value}</span>}
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="home-actions-heading">
          <h2 id="home-actions-heading" className="font-heading text-lg font-semibold">{t('dashboard.quick_actions')}</h2>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleNewNote()}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('dashboard.action_new_note')}</Button>
            <Button type="button" variant="outline" onClick={() => void handleUpload()}><HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />{t('dashboard.action_upload')}</Button>
            <Button type="button" variant="outline" onClick={() => openChatTab(`session_${Date.now()}`, 'Chat')}><HugeiconsIcon icon={Chat01Icon} data-icon="inline-start" />{t('dashboard.action_new_chat')}</Button>
            <Button type="button" variant="outline" onClick={openCalendarTab}><HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />{t('workspace.calendar')}</Button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>{t('dashboard.continue_activity')}</CardTitle>
              <CardDescription>{t('dashboard.continue_activity_desc', 'Tu trabajo más reciente.')}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <div className="flex flex-col gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : activity.length ? (
                <ItemGroup>
                  {activity.slice(0, 6).map((item) => (
                    <Item key={item.id} variant="muted" size="sm" render={<Button type="button" variant="ghost" onClick={() => openActivity(item)} />}>
                      <ItemMedia variant="icon"><HugeiconsIcon icon={item.kind === 'chat' ? Chat01Icon : Note01Icon} /></ItemMedia>
                      <ItemContent><ItemTitle>{item.title}</ItemTitle><ItemDescription>{item.subtitle || formatDistanceToNow(item.timestamp)}</ItemDescription></ItemContent>
                      <ItemActions><HugeiconsIcon icon={ArrowRight01Icon} className="text-muted-foreground" /></ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              ) : <p className="py-8 text-center text-sm text-muted-foreground">{t('dashboard.no_recent_activity')}</p>}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="shadow-sm">
              <CardHeader><CardTitle>{t('projects.your_projects')}</CardTitle></CardHeader>
              <CardContent>
                <ItemGroup>
                  {recentProjects.map((project) => (
                    <Item key={project.id} size="sm" render={<Button type="button" variant="ghost" onClick={() => setCurrentProject(project)} />}>
                      <ItemMedia variant="icon"><HugeiconsIcon icon={Folder01Icon} /></ItemMedia>
                      <ItemContent><ItemTitle>{project.name}</ItemTitle><ItemDescription>{project.description || t('projects.vault_default_hint')}</ItemDescription></ItemContent>
                      {project.id === currentProject?.id ? <Badge variant="secondary">{t('projects.active')}</Badge> : null}
                    </Item>
                  ))}
                </ItemGroup>
                <Button type="button" variant="ghost" className="mt-3 w-full" onClick={openProjectsTab}>{t('projects.open_library')}<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></Button>
              </CardContent>
            </Card>

            {pendingToday.length ? (
              <Card className="shadow-sm">
                <CardHeader><CardTitle>{t('dashboard.pending_today')}</CardTitle></CardHeader>
                <CardContent><ItemGroup>{pendingToday.slice(0, 3).map((item) => (
                  <Item key={item.id} size="sm" render={<Button type="button" variant="ghost" onClick={() => openPending(item)} />}>
                    <ItemContent><ItemTitle>{item.title}</ItemTitle><ItemDescription>{item.subtitle || item.timeLabel}</ItemDescription></ItemContent>
                    {item.tag ? <Badge variant="outline">{item.tag}</Badge> : null}
                  </Item>
                ))}</ItemGroup></CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
