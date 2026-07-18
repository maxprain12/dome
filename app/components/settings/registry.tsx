import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { IconSvgElement } from '@hugeicons/react';
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

/**
 * Settings information architecture. Section ids are a public contract:
 * deep links (`?section=`), the `settings:navigate-to-section` IPC event and
 * the `dome:goto-settings-section` CustomEvent all address these ids.
 */
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

/** Sections reachable from the nav (legacy aliases resolve into these). */
type NavSection = Exclude<SettingsSection, 'transcription'>;

export interface SettingsEntry {
  id: NavSection;
  icon: IconSvgElement;
  groupLabelKey: string;
  titleKey: string;
  keywords: string[];
  legacyAliases: string[];
  component: LazyExoticComponent<ComponentType>;
}

interface GroupDef {
  labelKey: string;
  sections: Array<{ id: NavSection; icon: IconSvgElement; legacyAliases?: string[] }>;
}

const GROUP_DEFS: GroupDef[] = [
  {
    labelKey: 'settings.groups.account',
    sections: [{ id: 'general', icon: UserIcon }],
  },
  {
    labelKey: 'settings.groups.appearance_language',
    sections: [
      { id: 'appearance', icon: PaintBoardIcon },
      { id: 'language', icon: GlobeIcon },
    ],
  },
  {
    labelKey: 'settings.groups.ai',
    sections: [{ id: 'ai', icon: BrainIcon, legacyAliases: ['transcription'] }],
  },
  {
    labelKey: 'settings.groups.integrations',
    sections: [
      { id: 'cloud', icon: CloudIcon },
      { id: 'dome_sync', icon: CloudCogIcon },
      { id: 'calendar', icon: Calendar03Icon },
      { id: 'email', icon: Mail01Icon },
      { id: 'social', icon: Share08Icon },
    ],
  },
  {
    labelKey: 'settings.groups.automation_extensions',
    sections: [
      { id: 'mcp', icon: Plug02Icon },
      { id: 'dome_mcp', icon: ServerStack01Icon },
      { id: 'skills', icon: MagicWand01Icon },
      { id: 'plugins', icon: PuzzleIcon },
    ],
  },
  {
    labelKey: 'settings.groups.data_privacy',
    sections: [
      { id: 'features', icon: LayoutGridIcon },
      { id: 'indexing', icon: DatabaseIcon },
      { id: 'kb_llm', icon: BookMarkedIcon },
    ],
  },
  {
    labelKey: 'settings.groups.system',
    sections: [{ id: 'advanced', icon: Settings01Icon }],
  },
];

const SECTION_COMPONENTS: Record<NavSection, LazyExoticComponent<ComponentType>> = {
  general: lazy(() => import('./sections/GeneralSection')),
  appearance: lazy(() => import('./sections/AppearanceSection')),
  language: lazy(() => import('./sections/LanguageSection')),
  features: lazy(() => import('./sections/FeaturesSection')),
  ai: lazy(() => import('./sections/AISection')),
  mcp: lazy(() => import('./sections/McpSection')),
  dome_mcp: lazy(() => import('./sections/DomeMcpSection')),
  skills: lazy(() => import('./sections/SkillsSection')),
  plugins: lazy(() => import('./sections/PluginsSection')),
  advanced: lazy(() => import('./sections/AdvancedSection')),
  indexing: lazy(() => import('./sections/IndexingSection')),
  cloud: lazy(() => import('./sections/CloudStorageSection')),
  dome_sync: lazy(() => import('./sections/DomeSyncSection')),
  kb_llm: lazy(() => import('./sections/KbLlmSection')),
  calendar: lazy(() => import('./sections/CalendarSection')),
  email: lazy(() => import('./sections/EmailSection')),
  social: lazy(() => import('./sections/SocialSection')),
};

export interface SettingsGroupEntry {
  labelKey: string;
  entries: SettingsEntry[];
}

export const SETTINGS_GROUPS: SettingsGroupEntry[] = GROUP_DEFS.map((group) => ({
  labelKey: group.labelKey,
  entries: group.sections.map((section) => ({
    id: section.id,
    icon: section.icon,
    groupLabelKey: group.labelKey,
    titleKey: `settings.tabs.${section.id}`,
    keywords: [section.id, group.labelKey],
    legacyAliases: section.legacyAliases ?? [],
    component: SECTION_COMPONENTS[section.id],
  })),
}));

export const SETTINGS_ENTRIES: SettingsEntry[] = SETTINGS_GROUPS.flatMap((g) => g.entries);

export function resolveSettingsSection(value: string | null | undefined): SettingsSection {
  if (!value) return 'general';
  const entry = SETTINGS_ENTRIES.find(
    (candidate) => candidate.id === value || candidate.legacyAliases.includes(value),
  );
  return entry?.id ?? 'general';
}

export function getSettingsEntry(section: SettingsSection): SettingsEntry {
  const normalized = resolveSettingsSection(section);
  return SETTINGS_ENTRIES.find((entry) => entry.id === normalized) ?? SETTINGS_ENTRIES[0];
}

/** Drop sections the current user cannot access (e.g. cloud without plan). */
export function filterSettingsGroups(
  groups: SettingsGroupEntry[],
  hidden: ReadonlySet<SettingsSection>,
): SettingsGroupEntry[] {
  if (hidden.size === 0) return groups;
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => !hidden.has(entry.id)),
    }))
    .filter((group) => group.entries.length > 0);
}
