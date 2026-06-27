/**
 * Renderer helper — load SOUL/USER/MEMORY context files via IPC.
 */

export type PersonalityContextFiles = {
  soul: string;
  user: string;
  memory: string;
  recentMemory: string;
};

const EMPTY: PersonalityContextFiles = { soul: '', user: '', memory: '', recentMemory: '' };

export async function loadPersonalityContextFiles(): Promise<PersonalityContextFiles> {
  const invoke = window.electron?.invoke;
  if (!invoke) return EMPTY;
  try {
    const res = await invoke('personality:get-context-files');
    if (res?.success && res.data) {
      const d = res.data as PersonalityContextFiles;
      return {
        soul: d.soul ?? '',
        user: d.user ?? '',
        memory: d.memory ?? '',
        recentMemory: d.recentMemory ?? '',
      };
    }
  } catch {
    /* offline / IPC unavailable */
  }
  return EMPTY;
}

/** Merge user + memory + recent into one volatile block (Hermes-style). */
export function formatPersonalityMemoryBlock(files: PersonalityContextFiles): string {
  const parts: string[] = [];
  if (files.user.trim()) parts.push(files.user.trim());
  if (files.memory.trim()) parts.push(files.memory.trim());
  if (files.recentMemory.trim()) parts.push(files.recentMemory.trim());
  return parts.join('\n\n');
}
