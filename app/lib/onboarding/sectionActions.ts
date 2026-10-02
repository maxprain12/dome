import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { SettingsSection } from '@/components/settings/registry';

export type GuideAction = 'explore' | 'ai' | 'account' | 'sync' | 'email' | 'calendar' | 'social' | 'modes' | 'projects' | 'agents' | 'learn' | 'runs';

const SETTINGS_ACTIONS: Partial<Record<GuideAction, SettingsSection>> = {
  ai: 'ai', account: 'general', sync: 'dome_sync', email: 'email',
  calendar: 'calendar', social: 'social', modes: 'features',
};

/** Navigate to existing product surfaces. Reading a guide never creates or sends content. */
export function runGuideAction(action: GuideAction): void {
  const tabs = useTabStore.getState();
  const settings = SETTINGS_ACTIONS[action];
  if (settings) {
    useSettingsUiStore.getState().setActiveSection(settings);
    tabs.openSettingsTab();
    return;
  }
  switch (action) {
    case 'projects': tabs.openProjectsTab(); break;
    case 'agents': tabs.openAgentsTab(); break;
    case 'learn': tabs.openLearnTab(); break;
    case 'runs': tabs.openRunsTab(); break;
    default: break; // Closing the guide reveals the current section.
  }
}

const ACTIONS: Record<string, readonly [GuideAction, GuideAction, GuideAction]> = {
  home: ['explore', 'projects', 'ai'], library: ['explore', 'projects', 'ai'],
  projects: ['explore', 'explore', 'explore'], people: ['explore', 'explore', 'explore'],
  email: ['email', 'explore', 'explore'], social: ['social', 'explore', 'sync'],
  calendar: ['calendar', 'explore', 'explore'], github: ['explore', 'explore', 'explore'],
  agents: ['explore', 'explore', 'ai'], pipelines: ['explore', 'agents', 'explore'],
  workflows: ['explore', 'agents', 'runs'], automations: ['explore', 'agents', 'runs'],
  runs: ['explore', 'explore', 'agents'], learn: ['explore', 'explore', 'explore'],
  marketplace: ['explore', 'explore', 'modes'], chat: ['ai', 'explore', 'explore'],
  settings: ['account', 'ai', 'modes'], tags: ['explore', 'explore', 'projects'],
  editor: ['explore', 'explore', 'ai'],
};
export function guideAction(section: string, step: number): GuideAction {
  return ACTIONS[section]?.[step] ?? 'explore';
}
export function reviewedStepKey(section: string, step: number): string { return `${section}:reviewed:${step}`; }
