import type { IconSvgElement } from '@hugeicons/react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  BookMarkedIcon,
  BrainIcon,
  Calendar03Icon,
  CloudCogIcon,
  CloudIcon,
  DatabaseIcon,
  GlobeIcon,
  LayoutGridIcon,
  MagicWand01Icon,
  Mail01Icon,
  PaintBoardIcon,
  Plug02Icon,
  PuzzleIcon,
  ServerStack01Icon,
  Settings01Icon,
  Share08Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';

export type SettingsSection =
  | 'general'
  | 'appearance'
  | 'features'
  | 'ai'
  | 'transcription'
  | 'mcp'
  | 'dome_mcp'
  | 'skills'
  | 'plugins'
  | 'advanced'
  | 'indexing'
  | 'cloud'
  | 'dome_sync'
  | 'language'
  | 'kb_llm'
  | 'calendar'
  | 'email'
  | 'social';

export interface NavItem {
  id: SettingsSection;
  icon: IconSvgElement;
}

export interface NavGroup {
  labelKey: string;
  /** Item runs separated by subtle dividers (long sections). */
  itemRuns?: NavItem[][];
  items?: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings.groups.account',
    items: [
      { id: 'general', icon: UserIcon },
    ],
  },
  {
    labelKey: 'settings.groups.appearance_language',
    items: [
      { id: 'appearance', icon: PaintBoardIcon },
      { id: 'language', icon: GlobeIcon },
    ],
  },
  {
    labelKey: 'settings.groups.ai',
    items: [
      { id: 'ai', icon: BrainIcon },
    ],
  },
  {
    labelKey: 'settings.groups.integrations',
    items: [
      { id: 'cloud', icon: CloudIcon },
      { id: 'dome_sync', icon: CloudCogIcon },
      { id: 'calendar', icon: Calendar03Icon },
      { id: 'email', icon: Mail01Icon },
      { id: 'social', icon: Share08Icon },
    ],
  },
  {
    labelKey: 'settings.groups.automation_extensions',
    items: [
      { id: 'mcp', icon: Plug02Icon },
      { id: 'dome_mcp', icon: ServerStack01Icon },
      { id: 'skills', icon: MagicWand01Icon },
      { id: 'plugins', icon: PuzzleIcon },
    ],
  },
  {
    labelKey: 'settings.groups.data_privacy',
    items: [
      { id: 'features', icon: LayoutGridIcon },
      { id: 'indexing', icon: DatabaseIcon },
      { id: 'kb_llm', icon: BookMarkedIcon },
    ],
  },
  {
    labelKey: 'settings.groups.system',
    items: [
      { id: 'advanced', icon: Settings01Icon },
    ],
  },
];

const SETTINGS_PANELS: Record<Exclude<SettingsSection, 'transcription'>, LazyExoticComponent<ComponentType>> = {
  general: lazy(() => import('./GeneralSettings')),
  appearance: lazy(() => import('./AppearanceSettings')),
  features: lazy(() => import('./FeaturesSettings')),
  ai: lazy(() => import('./AISettingsPanel')),
  mcp: lazy(() => import('./MCPSettingsPanel')),
  dome_mcp: lazy(() => import('./DomeMcpServerSettings')),
  skills: lazy(() => import('./SkillsSettingsPanel')),
  plugins: lazy(() => import('./PluginsSettings')),
  advanced: lazy(() => import('./AdvancedSettings')),
  indexing: lazy(() => import('./IndexingSettings')),
  cloud: lazy(() => import('./CloudStorageSettings')),
  dome_sync: lazy(() => import('./DomeSyncSettings')),
  language: lazy(() => import('./LanguageSettings')),
  kb_llm: lazy(() => import('./KbLlmSettingsPanel')),
  calendar: lazy(() => import('./CalendarSettingsPanel')),
  email: lazy(() => import('./EmailSettings')),
  social: lazy(() => import('./SocialSettings')),
};

export interface SettingsRegistryEntry extends NavItem {
  groupLabelKey: string;
  titleKey: string;
  keywords: string[];
  legacyAliases: string[];
  component: LazyExoticComponent<ComponentType>;
}

export const SETTINGS_REGISTRY: SettingsRegistryEntry[] = NAV_GROUPS.flatMap((group) =>
  getGroupItems(group).flat().map((item) => ({
    ...item,
    groupLabelKey: group.labelKey,
    titleKey: `settings.tabs.${item.id}`,
    keywords: [item.id, group.labelKey],
    legacyAliases: item.id === 'ai' ? ['transcription'] : [],
    component: SETTINGS_PANELS[item.id as Exclude<SettingsSection, 'transcription'>],
  })),
);

export function resolveSettingsSection(value: string | null | undefined): SettingsSection {
  if (!value) return 'general';
  const entry = SETTINGS_REGISTRY.find((candidate) => candidate.id === value || candidate.legacyAliases.includes(value));
  return entry?.id ?? 'general';
}

export function getSettingsEntry(section: SettingsSection): SettingsRegistryEntry {
  const normalized = resolveSettingsSection(section);
  return SETTINGS_REGISTRY.find((entry) => entry.id === normalized) ?? SETTINGS_REGISTRY[0];
}

export function getGroupItems(group: NavGroup): NavItem[][] {
  if (group.itemRuns) return group.itemRuns;
  return [group.items ?? []];
}

/** Maps legacy aliases (e.g. transcription) to a nav-visible section id. */
export function normalizeNavSection(section: SettingsSection): SettingsSection {
  if (section === 'transcription') return 'ai';
  return section;
}

export function findNavItem(section: SettingsSection): NavItem | undefined {
  const normalized = normalizeNavSection(section);
  for (const group of NAV_GROUPS) {
    for (const run of getGroupItems(group)) {
      for (const item of run) {
        if (item.id === normalized) return item;
      }
    }
  }
  return undefined;
}

/** Hide settings sections the current user cannot access (e.g. cloud without subscription). */
export function filterNavGroups(
  groups: NavGroup[],
  hidden: ReadonlySet<SettingsSection>,
): NavGroup[] {
  const filterRun = (run: NavItem[]) => run.filter((item) => !hidden.has(item.id));
  const out: NavGroup[] = [];
  for (const group of groups) {
    if (group.itemRuns) {
      const itemRuns = group.itemRuns.map(filterRun).filter((run) => run.length > 0);
      if (itemRuns.length > 0) out.push({ ...group, itemRuns });
      continue;
    }
    const items = (group.items ?? []).filter((item) => !hidden.has(item.id));
    if (items.length > 0) out.push({ ...group, items });
  }
  return out;
}
