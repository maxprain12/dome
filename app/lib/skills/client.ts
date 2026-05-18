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

export interface SkillFromUrlResult {
  success: boolean;
  data?: { id: string; name: string; description: string; dir: string };
  error?: string;
}

export interface SkillRepoEntry {
  id: string;
  name: string;
  description: string;
  skillUrl: string;
}

export async function installSkillFromUrl(url: string): Promise<SkillFromUrlResult> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.marketplace.installSkillFromUrl(url) as Promise<SkillFromUrlResult>;
}

export async function browseSkillRepo(repoUrl: string): Promise<{ success: boolean; data?: SkillRepoEntry[]; error?: string }> {
  if (!hasElectron()) return { success: false, error: 'Not in Electron' };
  return window.electron.marketplace.browseSkillRepo(repoUrl) as Promise<{ success: boolean; data?: SkillRepoEntry[]; error?: string }>;
}
