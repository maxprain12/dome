export type TabType =
  | 'home'
  | 'projects'
  | 'note'
  | 'notebook'
  | 'resource'
  | 'url'
  | 'youtube'
  | 'docx'
  | 'ppt'
  | 'settings'
  | 'chat'
  | 'calendar'
  | 'github'
  | 'email'
  | 'social'
  | 'people'
  | 'studio'
  | 'flashcards'
  | 'tags'
  | 'marketplace'
  | 'pipelines'
  | 'agents'
  | 'workflows'
  | 'automations'
  | 'runs'
  | 'folder'
  | 'learn'
  | 'transcriptions'
  | 'transcription-detail'
  | 'semantic-graph'
  | 'artifact';

export type TabConfig = {
  type: TabType;
  projectScoped: boolean;
  sidebarNav: boolean;
  resourceSource: boolean;
  needsResourceId: boolean;
};

const TAB_CONFIGS: TabConfig[] = [
  { type: 'home', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'projects', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'note', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'notebook', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'resource', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'url', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'youtube', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'docx', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'ppt', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
  { type: 'settings', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'chat', projectScoped: false, sidebarNav: false, resourceSource: false, needsResourceId: false },
  { type: 'calendar', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'github', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'email', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'social', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'people', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'studio', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'flashcards', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'tags', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'marketplace', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'pipelines', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'agents', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'workflows', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'automations', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'runs', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'folder', projectScoped: true, sidebarNav: false, resourceSource: false, needsResourceId: true },
  { type: 'learn', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'transcriptions', projectScoped: false, sidebarNav: true, resourceSource: false, needsResourceId: false },
  { type: 'transcription-detail', projectScoped: true, sidebarNav: false, resourceSource: false, needsResourceId: true },
  { type: 'semantic-graph', projectScoped: true, sidebarNav: false, resourceSource: false, needsResourceId: false },
  { type: 'artifact', projectScoped: true, sidebarNav: false, resourceSource: true, needsResourceId: true },
];

export const TAB_REGISTRY: Record<TabType, TabConfig> = Object.fromEntries(
  TAB_CONFIGS.map((config) => [config.type, config]),
) as Record<TabType, TabConfig>;

export const PROJECT_SCOPED_TAB_TYPES: ReadonlySet<TabType> = new Set(
  TAB_CONFIGS.filter((config) => config.projectScoped).map((config) => config.type),
);

export const SIDEBAR_NAV_TAB_TYPES: ReadonlySet<TabType> = new Set(
  TAB_CONFIGS.filter((config) => config.sidebarNav).map((config) => config.type),
);

export const RESOURCE_SOURCE_TAB_TYPES: ReadonlySet<TabType> = new Set(
  TAB_CONFIGS.filter((config) => config.resourceSource).map((config) => config.type),
);

export const RESOURCE_TYPE_TO_TAB: Record<string, TabType> = {
  note: 'note',
  notebook: 'notebook',
  url: 'url',
  youtube: 'youtube',
  docx: 'docx',
  ppt: 'ppt',
  document: 'resource',
  pdf: 'resource',
  image: 'resource',
  audio: 'resource',
  video: 'resource',
  excel: 'resource',
  artifact: 'artifact',
  default: 'resource',
};

export function getResourceTabType(resourceType: string): TabType {
  return RESOURCE_TYPE_TO_TAB[resourceType] ?? 'resource';
}

export function isRegisteredTabType(value: string): value is TabType {
  return Object.hasOwn(TAB_REGISTRY, value);
}
