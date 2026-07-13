import type { IconSvgElement } from '@hugeicons/react';
import {
  Activity01Icon,
  BookOpen01Icon,
  BotIcon,
  Calendar03Icon,
  GitBranchIcon,
  Home01Icon,
  Layers01Icon,
  Link02Icon,
  Mail01Icon,
  PlusSignIcon,
  Settings01Icon,
  Store01Icon,
  Upload04Icon,
  WorkflowSquare01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
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
  openMarketplaceTab: () => void;
  openSettingsTab: () => void;
}

export function buildNavigationDestinations(opts: BuildNavOptions): PaletteRow[] {
  const wrap = (key: string, label: string, icon: IconSvgElement, run: () => void): PaletteRow => ({
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
    { key: 'library', row: wrap('library', opts.t('workspace.home'), Home01Icon, opts.goHome) },
    { key: 'projects', row: wrap('projects', opts.t('tabs.projects'), Layers01Icon, opts.openProjectsTab) },
    { key: 'calendar', row: wrap('calendar', opts.t('workspace.calendar'), Calendar03Icon, opts.openCalendarTab) },
    { key: 'github', row: wrap('github', opts.t('github.tab_title'), GitBranchIcon, opts.openGitHubTab) },
    { key: 'email', row: wrap('email', opts.t('email.tab_title'), Mail01Icon, opts.openEmailTab) },
    { key: 'agents', row: wrap('agents', opts.t('automationHub.tab_agents'), BotIcon, opts.openAgentsTab) },
    { key: 'workflows', row: wrap('workflows', opts.t('automationHub.tab_workflows'), WorkflowSquare01Icon, opts.openWorkflowsTab) },
    { key: 'automations', row: wrap('automations', opts.t('automationHub.tab_automations'), ZapIcon, opts.openAutomationsTab) },
    { key: 'runs', row: wrap('runs', opts.t('automationHub.tab_runs'), Activity01Icon, opts.openRunsTab) },
    { key: 'learn', row: wrap('learn', opts.t('workspace.learn'), BookOpen01Icon, opts.openLearnTab) },
    { key: 'marketplace', row: wrap('marketplace', opts.t('workspace.marketplace'), Store01Icon, opts.openMarketplaceTab) },
    { key: 'settings', row: wrap('settings', opts.t('settings.title'), Settings01Icon, opts.openSettingsTab) },
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
  requestAddUrl: () => void;
}): PaletteRow[] {
  const wrapAction = (id: string, label: string, icon: IconSvgElement, run: () => void | Promise<void>): PaletteRow => ({
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
      PlusSignIcon,
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
      Upload04Icon,
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
      Link02Icon,
      opts.requestAddUrl,
    ),
  ];
}
