/**
 * Skills IPC client — backed by deepagents listSkills (native SKILL.md parsing).
 */
export interface SkillItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  path: string;
}

export interface SkillInstallResult {
  id: string;
  name: string;
  description: string;
  dir: string;
}

export interface SkillFromUrlResult {
  success: boolean;
  data?: SkillInstallResult | SkillInstallResult[];
  error?: string;
}

export interface SkillRepoEntry {
  id: string;
  name: string;
  description: string;
  skillUrl: string;
}

function hasElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electron?.invoke;
}

export async function listSkills(): Promise<{ success: boolean; data?: SkillItem[]; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:list') as Promise<{ success: boolean; data?: SkillItem[]; error?: string }>;
}

export async function openSkillsFolder(): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:openFolder') as Promise<{ success: boolean; error?: string }>;
}

export async function installBundledSkill(id: string): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:installBundled', id) as Promise<{ success: boolean; error?: string }>;
}

export async function addSkillsFromRepo(
  source: string,
  skillNames?: string[],
  overwrite = true,
): Promise<SkillFromUrlResult> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:add', { source, skillNames, overwrite }) as Promise<SkillFromUrlResult>;
}

export async function browseSkillsRepo(
  repoUrl: string,
): Promise<{ success: boolean; data?: SkillRepoEntry[]; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:browseRepo', { repoUrl }) as Promise<{
    success: boolean;
    data?: SkillRepoEntry[];
    error?: string;
  }>;
}

export async function removeSkill(skillId: string): Promise<{ success: boolean; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.invoke('skills:remove', { skillId }) as Promise<{ success: boolean; error?: string }>;
}

/** @deprecated Use addSkillsFromRepo or browseSkillsRepo + addSkillsFromRepo */
export async function installSkillFromUrl(url: string): Promise<SkillFromUrlResult> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.marketplace.installSkillFromUrl(url) as Promise<SkillFromUrlResult>;
}

/** @deprecated Use browseSkillsRepo */
export async function browseSkillRepo(repoUrl: string): Promise<{ success: boolean; data?: SkillRepoEntry[]; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.marketplace.browseSkillRepo(repoUrl) as Promise<{
    success: boolean;
    data?: SkillRepoEntry[];
    error?: string;
  }>;
}
