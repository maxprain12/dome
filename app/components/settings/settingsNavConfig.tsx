import type { ReactNode } from 'react';
import {
  User, Palette, Brain, Settings as SettingsIcon,
  Puzzle, Plug2, Wand2, Database, Cloud, CloudCog,
  Globe, BookMarked, Calendar, Server, Mail, LayoutGrid, Share2,
} from 'lucide-react';

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
  icon: ReactNode;
}

export interface NavGroup {
  labelKey: string;
  /** Item runs separated by subtle dividers (long sections). */
  itemRuns?: NavItem[][];
  items?: NavItem[];
}

const NAV_ICON_CLASS = 'size-3.5';

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'settings.groups.preferences',
    items: [
      { id: 'general', icon: <User className={NAV_ICON_CLASS} /> },
      { id: 'appearance', icon: <Palette className={NAV_ICON_CLASS} /> },
      { id: 'features', icon: <LayoutGrid className={NAV_ICON_CLASS} /> },
      { id: 'language', icon: <Globe className={NAV_ICON_CLASS} /> },
    ],
  },
  {
    labelKey: 'settings.groups.ai',
    items: [
      { id: 'ai', icon: <Brain className={NAV_ICON_CLASS} /> },
    ],
  },
  {
    labelKey: 'settings.groups.integrations',
    itemRuns: [
      [
        { id: 'cloud', icon: <Cloud className={NAV_ICON_CLASS} /> },
        { id: 'dome_sync', icon: <CloudCog className={NAV_ICON_CLASS} /> },
      ],
      [
        { id: 'calendar', icon: <Calendar className={NAV_ICON_CLASS} /> },
        { id: 'email', icon: <Mail className={NAV_ICON_CLASS} /> },
        { id: 'social', icon: <Share2 className={NAV_ICON_CLASS} /> },
      ],
      [
        { id: 'mcp', icon: <Plug2 className={NAV_ICON_CLASS} /> },
        { id: 'dome_mcp', icon: <Server className={NAV_ICON_CLASS} /> },
      ],
    ],
  },
  {
    labelKey: 'settings.groups.knowledge',
    items: [
      { id: 'indexing', icon: <Database className={NAV_ICON_CLASS} /> },
      { id: 'kb_llm', icon: <BookMarked className={NAV_ICON_CLASS} /> },
    ],
  },
  {
    labelKey: 'settings.groups.extensions',
    items: [
      { id: 'skills', icon: <Wand2 className={NAV_ICON_CLASS} /> },
      { id: 'plugins', icon: <Puzzle className={NAV_ICON_CLASS} /> },
    ],
  },
  {
    labelKey: 'settings.groups.system',
    items: [
      { id: 'advanced', icon: <SettingsIcon className={NAV_ICON_CLASS} /> },
    ],
  },
];

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
