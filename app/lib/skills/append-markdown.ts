/**
 * Shared "## Skills" block for renderer runtimes (agent chat, canvas executor, etc.)
 */
export interface SkillLike {
  id: string;
  name: string;
  prompt: string;
  enabled?: boolean;
}

export function appendSkillsMarkdown(base: string, skillIds: string[] | undefined, skills: SkillLike[]): string {
  const t = base.trimEnd();
  if (!skillIds?.length || !skills.length) return t;

  const chunks: string[] = [];
  for (const id of skillIds) {
    const s = skills.find((x) => x.id === id);
    if (!s || s.enabled === false) continue;
    const body = (s.prompt || '').trim();
    if (!body) continue;
    chunks.push(`### ${s.name || 'Skill'}\n${body}\n`);
  }
  if (chunks.length === 0) return t;
  return `${t}\n\n## Skills\n${chunks.join('\n')}`;
}
