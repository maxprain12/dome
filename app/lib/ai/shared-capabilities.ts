import type { AgentTeam, ManyAgent } from '@/types';

export type SharedSubagentId = 'research' | 'library' | 'writer' | 'data';

export interface SharedAgentContext {
  pathname: string;
  homeSidebarSection?: string;
  currentFolderId?: string | null;
  currentResourceId?: string | null;
  currentResourceTitle?: string | null;
  teamId?: string | null;
  workflowId?: string | null;
}

export interface ManyCapabilitySelection {
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  mcpEnabled: boolean;
}

export interface ManyCapabilityRuntimeConfig {
  subagentIds: SharedSubagentId[];
  mcpServerIds: string[] | undefined;
}

const HOME_SECTION_LOCATIONS: Record<string, { location: string; description: string }> = {
  studio: { location: 'Home > Studio', description: 'working with Studio outputs and generation tools' },
  flashcards: { location: 'Home > Flashcards', description: 'reviewing or organizing flashcards' },
  tags: { location: 'Home > Tags', description: 'browsing resources by tag' },
  agents: { location: 'Home > Agents', description: 'managing specialized agents' },
  'agent-teams': { location: 'Home > Workflows', description: 'working with workflows and agent teams' },
  marketplace: { location: 'Home > Marketplace', description: 'exploring marketplace items, agents, and workflows' },
  projects: { location: 'Home > Projects', description: 'managing projects' },
  chat: { location: 'Home > Many Chat', description: 'chatting with Many from Home' },
  recent: { location: 'Home > Recent', description: 'reviewing recently updated resources and links' },
  library: { location: 'Home > Library', description: 'browsing the main library of folders and resources' },
};
const DEFAULT_HOME_SECTION = HOME_SECTION_LOCATIONS.library!;

export const SHARED_CAPABILITY_PRESETS = {
  many: ['research', 'library', 'writer', 'data'] as SharedSubagentId[],
  team: ['research', 'library', 'writer', 'data'] as SharedSubagentId[],
  canvas: ['library', 'writer', 'data'] as SharedSubagentId[],
} as const;

export function describeHomeSection(section?: string): { location: string; description: string } {
  if (!section) {
    return DEFAULT_HOME_SECTION;
  }
  return HOME_SECTION_LOCATIONS[section] ?? DEFAULT_HOME_SECTION;
}

export function getUiLocationDescription(pathname: string, homeSidebarSection?: string): {
  location: string;
  description: string;
} {
  if (pathname === '/' || pathname === '/home') {
    return describeHomeSection(homeSidebarSection);
  }
  if (pathname === '/calendar') {
    return { location: 'Calendar', description: 'viewing or managing calendar events' };
  }
  if (pathname.startsWith('/workspace/notebook')) {
    return { location: 'Notebook Workspace', description: 'editing a notebook with cells and code' };
  }
  if (pathname.startsWith('/workspace/docx')) {
    return { location: 'Document Editor', description: 'editing a DOCX document' };
  }
  if (pathname.startsWith('/workspace/ppt')) {
    return { location: 'PPT Workspace', description: 'viewing or editing a PowerPoint resource' };
  }
  if (pathname.startsWith('/workspace/url')) {
    return { location: 'URL Viewer', description: 'viewing a web resource' };
  }
  if (pathname.startsWith('/workspace/youtube')) {
    return { location: 'YouTube Player', description: 'watching a YouTube video' };
  }
  if (pathname.startsWith('/workspace/')) {
    return { location: 'Workspace', description: 'working on a resource' };
  }
  return { location: 'Dome', description: 'in the application' };
}

export function buildSharedUiContextBlock(context: SharedAgentContext): string {
  const lines = ['## Current UI Context', `- Route: ${context.pathname || '/'}`];

  if (context.pathname === '/' || context.pathname === '/home') {
    lines.push(`- Active Home section: ${context.homeSidebarSection || 'library'}`);
  }
  if (context.currentFolderId) {
    lines.push(`- Current folder ID: ${context.currentFolderId}`);
  }
  if (context.currentResourceId) {
    lines.push(`- Current resource ID: ${context.currentResourceId}`);
  }
  if (context.currentResourceTitle) {
    lines.push(`- Current resource title: "${context.currentResourceTitle}"`);
  }
  if (context.teamId) {
    lines.push(`- Team ID: ${context.teamId}`);
  }
  if (context.workflowId) {
    lines.push(`- Workflow ID: ${context.workflowId}`);
  }

  lines.push('- Use this UI context when deciding which Dome section, resource, or folder is relevant.');
  return lines.join('\n');
}

export function buildSharedResourceHint(context: SharedAgentContext): string {
  const hints: string[] = [];
  const isNotebook = context.pathname.includes('/workspace/notebook');

  if (context.currentResourceId) {
    hints.push(
      `The user is viewing resource ID: ${context.currentResourceId}` +
        (context.currentResourceTitle ? ` (title: "${context.currentResourceTitle}")` : '') +
        '. Include this resource in delegated work whenever it is relevant.'
    );
    hints.push(
      'For questions about this resource: use resource_get first. Do NOT call get_document_structure—resource_get already returns the structure for indexed PDFs.'
    );

    if (isNotebook) {
      hints.push(
        `The current resource is a notebook. Prefer notebook_get, notebook_add_cell, notebook_update_cell, and notebook_delete_cell with resource_id: "${context.currentResourceId}".`
      );
    }
  }

  if ((context.pathname === '/' || context.pathname === '/home') && context.currentFolderId) {
    hints.push(
      `The user is viewing folder ID: ${context.currentFolderId}. Use folder-aware listing or creation when organizing or creating resources.`
    );
  }

  return hints.length > 0 ? `\n\n## Active Resource and Folder Hints\n- ${hints.join('\n- ')}` : '';
}

export function resolveManyCapabilityRuntime(
  selection: ManyCapabilitySelection,
  mcpServerIds?: string[]
): ManyCapabilityRuntimeConfig {
  if (!selection.toolsEnabled) {
    return {
      subagentIds: [],
      mcpServerIds: undefined,
    };
  }

  const subagentIds: SharedSubagentId[] = selection.resourceToolsEnabled
    ? [...SHARED_CAPABILITY_PRESETS.many]
    : ['research'];

  return {
    subagentIds,
    mcpServerIds: selection.mcpEnabled ? mcpServerIds : [],
  };
}

export function collectTeamToolIds(team: AgentTeam | null, members: ManyAgent[]): string[] {
  const ids = new Set<string>();

  for (const member of members) {
    for (const toolId of member.toolIds ?? []) {
      ids.add(toolId);
    }
  }

  for (const toolId of team?.toolIds ?? []) {
    ids.add(toolId);
  }

  return Array.from(ids);
}

export function collectTeamMcpServerIds(team: AgentTeam | null, members: ManyAgent[]): string[] {
  const ids = new Set<string>();

  for (const member of members) {
    for (const serverId of member.mcpServerIds ?? []) {
      ids.add(serverId);
    }
  }

  for (const serverId of team?.mcpServerIds ?? []) {
    ids.add(serverId);
  }

  return Array.from(ids);
}

export function summarizeCapabilityProfile(toolIds: string[]): string[] {
  const normalized = new Set(toolIds.map((toolId) => toolId.toLowerCase()));
  const summary: string[] = [];

  if (Array.from(normalized).some((toolId) => toolId.startsWith('resource_') || toolId.includes('library'))) {
    summary.push('library');
  }
  if (Array.from(normalized).some((toolId) => toolId.startsWith('web_') || toolId.includes('research'))) {
    summary.push('research');
  }
  if (Array.from(normalized).some((toolId) => toolId.includes('notebook') || toolId.includes('resource_create') || toolId.includes('flashcard'))) {
    summary.push('writing');
  }
  if (Array.from(normalized).some((toolId) => toolId.includes('excel') || toolId.includes('ppt') || toolId.includes('calendar'))) {
    summary.push('operations');
  }

  return summary;
}
