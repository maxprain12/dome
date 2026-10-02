import type { TabType } from '@/lib/store/useTabStore';

export interface SectionGuide {
  key: string;
  titleKey: string;
  stepKeys: string[];
}

/** One guide per user-facing destination, shared by first visit and contextual help. */
export const SECTION_KEYS = [
  'home', 'library', 'projects', 'people', 'email', 'social', 'calendar', 'github',
  'agents', 'pipelines', 'workflows', 'automations', 'runs', 'learn', 'marketplace',
  'chat', 'settings', 'tags', 'editor',
] as const;

export const SECTION_GUIDES: Record<string, SectionGuide> = Object.fromEntries(
  SECTION_KEYS.map((key) => [key, {
    key, titleKey: `sectionGuide.${key}.title`,
    stepKeys: [1, 2, 3].map((n) => `sectionGuide.${key}.step${n}`),
  }]),
);

const TAB_GUIDE: Partial<Record<TabType, string>> = {
  home: 'home', folder: 'library', projects: 'projects', people: 'people',
  email: 'email', social: 'social', calendar: 'calendar', github: 'github',
  agents: 'agents', pipelines: 'pipelines', workflows: 'workflows', automations: 'automations',
  runs: 'runs', learn: 'learn', studio: 'learn', flashcards: 'learn', marketplace: 'marketplace',
  chat: 'chat',
  settings: 'settings', tags: 'tags',
  note: 'editor', notebook: 'editor', resource: 'library', url: 'library', youtube: 'library',
  docx: 'library', ppt: 'library', artifact: 'library',
};

export function sectionForTab(type: TabType): string | undefined { return TAB_GUIDE[type]; }
export function getSectionGuide(key: string): SectionGuide | undefined { return SECTION_GUIDES[key]; }
