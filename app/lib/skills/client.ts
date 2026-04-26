/**
 * File-based skills (SKILL.md) — IPC to main process registry.
 */
export interface SkillListItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Present when `includeBody: true` */
  body?: string;
  filePath?: string;
  dirPath?: string;
  when_to_use: string;
  scope: 'bundled' | 'project' | 'plugin' | 'personal';
  argument_hint: string;
  arguments: string[];
  user_invocable: boolean;
  disable_model_invocation: boolean;
  paths: string[];
  allowed_tools: string[];
  model: string | null;
  effort: string | null;
  context: string | null;
  agent: string | null;
}

export interface SkillGetPayload {
  id: string;
  name: string;
  filePath: string;
  dirPath: string;
  body: string;
  /** Full SKILL.md file content */
  raw?: string;
  frontmatter: {
    name: string;
    description: string;
    when_to_use: string;
    argument_hint: string;
    arguments: string[];
    disable_model_invocation: boolean;
    user_invocable: boolean;
    paths: string[];
    allowed_tools: string[];
    model: string | null;
    effort: string | null;
    context: string | null;
    agent: string | null;
    shell: string;
  };
}

function hasElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.invoke;
}

export type SkillListItemWithBody = SkillListItem & { body?: string; filePath?: string; dirPath?: string };

export async function listSkills(options?: { includeBody?: boolean }): Promise<{
  success: boolean;
  data?: SkillListItemWithBody[];
  error?: string;
}> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:list', { includeBody: options?.includeBody === true }) as Promise<{
    success: boolean;
    data?: SkillListItemWithBody[];
    error?: string;
  }>;
}

export async function getSkill(id: string): Promise<{ success: boolean; data?: SkillGetPayload; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:get', id) as Promise<{ success: boolean; data?: SkillGetPayload; error?: string }>;
}

export async function invokeSkill(
  id: string,
  options?: { arguments?: string; sessionId?: string },
): Promise<{
  success: boolean;
  data?: {
    systemPromptBlock: string;
    id: string;
    name: string;
    body: string;
    context: string | null;
    agent: string | null;
    model: string | null;
    effort: string | null;
    allowed_tools: string[];
  };
  error?: string;
}> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:invoke', {
    id,
    arguments: options?.arguments,
    sessionId: options?.sessionId,
  });
}

export async function renderSkill(
  skillId: string,
  options?: { arguments?: string; sessionId?: string; disableSkillShellExecution?: boolean },
): Promise<{
  success: boolean;
  data?: {
    body: string;
    id: string;
    name: string;
    context: string | null;
    agent: string | null;
    model: string | null;
    effort: string | null;
    allowed_tools: string[];
  };
  error?: string;
}> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:render', {
    skillId,
    arguments: options?.arguments,
    sessionId: options?.sessionId,
    disableSkillShellExecution: options?.disableSkillShellExecution,
  });
}

export async function reloadSkills(): Promise<{ success: boolean; data?: { count: number }; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:reload');
}

export async function openSkillFolder(skillId: string): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:openFolder', skillId);
}

export async function openPersonalSkillsRoot(): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:openPersonalRoot');
}

export async function saveSkillFile(
  filePath: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:save', { filePath, content });
}

export async function createSkill(slug?: string): Promise<{
  success: boolean;
  data?: { id: string; filePath: string; dirPath: string };
  error?: string;
}> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:create', { slug });
}

export async function getProjectSkillsRoot(): Promise<{ success: boolean; data?: { projectRoot: string | null }; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:getProjectRoot');
}

export async function setProjectSkillsRoot(
  rootPath: string | null,
): Promise<{ success: boolean; data?: { projectRoot: string | null }; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:setProjectRoot', rootPath ?? '');
}

export async function readSkillFile(
  skillId: string,
  relativePath: string,
): Promise<{ success: boolean; data?: { content: string; path: string }; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:readFile', { skillId, relativePath });
}

export async function installSkillFromManifest(payload: {
  id: string;
  name: string;
  description: string;
  instructions: string;
}): Promise<{
  success: boolean;
  data?: { id: string; filePath: string; dirPath: string };
  error?: string;
}> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:installFromManifest', payload);
}

type ToolDefinitionShape = {
  type?: string;
  function?: { name?: string };
  name?: string;
};

/**
 * Filter OpenAI-format tool definitions by the union of `allowed_tools`
 * declared by the active skills. If no active skill declares
 * `allowed_tools`, the array is returned unchanged.
 */
export function filterToolsBySkill<T extends ToolDefinitionShape>(
  skillRecords: Pick<SkillListItem, 'allowed_tools'>[] | null | undefined,
  toolDefinitions: T[],
): T[] {
  if (!Array.isArray(toolDefinitions) || toolDefinitions.length === 0) return toolDefinitions ?? [];
  if (!Array.isArray(skillRecords) || skillRecords.length === 0) return toolDefinitions;
  const allowed = new Set<string>();
  let anyDeclared = false;
  for (const rec of skillRecords) {
    if (!rec || !Array.isArray(rec.allowed_tools) || rec.allowed_tools.length === 0) continue;
    anyDeclared = true;
    for (const t of rec.allowed_tools) {
      if (typeof t === 'string' && t.trim()) allowed.add(t.trim());
    }
  }
  if (!anyDeclared) return toolDefinitions;
  return toolDefinitions.filter((def) => {
    const name = def?.function?.name ?? def?.name;
    return typeof name === 'string' && allowed.has(name);
  });
}

/** Legacy shape for code still expecting { id, name, description, prompt, enabled? } from DB */
export function skillListToLegacy(
  items: SkillListItem[],
  bodyById: Map<string, string>,
): Array<{ id: string; name: string; description: string; prompt: string; enabled: boolean }> {
  return items.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    prompt: (bodyById.get(s.id) ?? s.description) || '',
    enabled: !s.disable_model_invocation,
  }));
}
