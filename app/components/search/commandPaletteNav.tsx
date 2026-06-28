import type { ReactNode } from 'react';
import {
  Home,
  Calendar,
  Settings,
  Bot,
  Workflow,
  Zap,
  Activity,
  Layers,
  BookOpen,
  Tag,
  Store,
  Mail,
  ListTodo,
  Plus,
  Upload,
  Link2,
} from 'lucide-react';
import type { PaletteRow } from './commandPaletteTypes';

interface BuildNavOptions {
  t: (key: string) => string;
  navVisible: (key: string) => boolean;
  close: () => void;
  goHome: () => void;
  openProjectsTab: () => void;
  openCalendarTab: () => void;
  openGitHubTab: () => void;
  openEmailTab: () => void;
  openAgentsTab: () => void;
  openWorkflowsTab: () => void;
  openAutomationsTab: () => void;
  openRunsTab: () => void;
  openLearnTab: () => void;
  openTagsTab: () => void;
  openMarketplaceTab: () => void;
  openSettingsTab: () => void;
}

export function buildNavigationDestinations(opts: BuildNavOptions): PaletteRow[] {
  const sw = 1.75;
  const iconClass = 'size-4 shrink-0';
  const wrap = (key: string, label: string, icon: ReactNode, run: () => void): PaletteRow => ({
    id: `nav:${key}`,
    kind: 'nav',
    label,
    icon,
    run: () => {
      run();
      opts.close();
    },
  });

  const items: Array<{ key: string; row: PaletteRow }> = [
    { key: 'library', row: wrap('library', opts.t('workspace.home'), <Home className={iconClass} strokeWidth={sw} />, opts.goHome) },
    { key: 'projects', row: wrap('projects', opts.t('tabs.projects'), <Layers className={iconClass} strokeWidth={sw} />, opts.openProjectsTab) },
    { key: 'calendar', row: wrap('calendar', opts.t('workspace.calendar'), <Calendar className={iconClass} strokeWidth={sw} />, opts.openCalendarTab) },
    { key: 'github', row: wrap('github', opts.t('github.tab_title'), <ListTodo className={iconClass} strokeWidth={sw} />, opts.openGitHubTab) },
    { key: 'email', row: wrap('email', opts.t('email.tab_title'), <Mail className={iconClass} strokeWidth={sw} />, opts.openEmailTab) },
    { key: 'agents', row: wrap('agents', opts.t('automationHub.tab_agents'), <Bot className={iconClass} strokeWidth={sw} />, opts.openAgentsTab) },
    { key: 'workflows', row: wrap('workflows', opts.t('automationHub.tab_workflows'), <Workflow className={iconClass} strokeWidth={sw} />, opts.openWorkflowsTab) },
    { key: 'automations', row: wrap('automations', opts.t('automationHub.tab_automations'), <Zap className={iconClass} strokeWidth={sw} />, opts.openAutomationsTab) },
    { key: 'runs', row: wrap('runs', opts.t('automationHub.tab_runs'), <Activity className={iconClass} strokeWidth={sw} />, opts.openRunsTab) },
    { key: 'learn', row: wrap('learn', opts.t('workspace.learn'), <BookOpen className={iconClass} strokeWidth={sw} />, opts.openLearnTab) },
    { key: 'tags', row: wrap('tags', opts.t('workspace.tags'), <Tag className={iconClass} strokeWidth={sw} />, opts.openTagsTab) },
    { key: 'marketplace', row: wrap('marketplace', opts.t('workspace.marketplace'), <Store className={iconClass} strokeWidth={sw} />, opts.openMarketplaceTab) },
    { key: 'settings', row: wrap('settings', opts.t('settings.title'), <Settings className={iconClass} strokeWidth={sw} />, opts.openSettingsTab) },
  ];

  const rows: PaletteRow[] = [];
  for (const { key, row } of items) {
    if (key !== 'library' && key !== 'settings' && !opts.navVisible(key)) continue;
    rows.push(row);
  }
  return rows;
}

export function buildQuickActions(opts: {
  t: (key: string) => string;
  close: () => void;
  projectId: string;
  openResourceTab: (id: string, type: string, title: string, projectId?: string) => void;
}): PaletteRow[] {
  const sw = 1.75;
  const iconClass = 'size-4 shrink-0';

  const wrapAction = (id: string, label: string, icon: ReactNode, run: () => void | Promise<void>): PaletteRow => ({
    id: `action:${id}`,
    kind: 'action',
    label,
    icon,
    run: () => {
      void Promise.resolve(run()).finally(opts.close);
    },
  });

  return [
    wrapAction(
      'new-note',
      opts.t('command.new_note'),
      <Plus className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
      async () => {
        if (!window.electron?.db?.resources?.create) return;
        const now = Date.now();
        const res = {
          id: `res_${now}_${Math.random().toString(36).slice(2, 11)}`,
          type: 'note' as const,
          title: opts.t('dashboard.untitled_note'),
          content: '',
          project_id: opts.projectId,
          created_at: now,
          updated_at: now,
        };
        const result = await window.electron.db.resources.create(res);
        if (result.success && result.data) {
          opts.openResourceTab(result.data.id, 'note', result.data.title, opts.projectId);
        }
      },
    ),
    wrapAction(
      'upload',
      opts.t('command.upload_files'),
      <Upload className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
      async () => {
        if (!window.electron?.selectFiles || !window.electron?.resource?.importMultiple) return;
        const paths = await window.electron.selectFiles({ properties: ['openFile', 'multiSelections'] });
        if (paths?.length) {
          await window.electron.resource.importMultiple(paths, opts.projectId);
        }
      },
    ),
    wrapAction(
      'add-url',
      opts.t('command.add_url'),
      <Link2 className={iconClass} strokeWidth={sw} style={{ color: 'var(--dome-accent)' }} />,
      async () => {
        const url = prompt(opts.t('command.please_enter_url'));
        if (!url || !window.electron?.db?.resources?.create) return;
        const now = Date.now();
        const id = `res_${now}_${Math.random().toString(36).slice(2, 11)}`;
        const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;
        await window.electron.db.resources.create({
          id,
          type: 'url',
          title,
          project_id: opts.projectId,
          content: url,
          created_at: now,
          updated_at: now,
        });
      },
    ),
  ];
}
