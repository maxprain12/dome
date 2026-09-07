import type { Resource } from '@/types';

/** Notes have one persisted format and one authoritative location. */
export async function loadNoteMarkdown(resource: Resource): Promise<string> {
  const mirror = await window.electron.notes.readMirror({ id: resource.id });
  if (!mirror.success || typeof mirror.markdown !== 'string') {
    throw new Error(mirror.error || 'Note file unavailable');
  }
  return mirror.markdown;
}

export function countWordsFromMarkdown(markdown: string): number {
  const text = markdown.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_\[\]()!|`~-]/g, ' ');
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}
