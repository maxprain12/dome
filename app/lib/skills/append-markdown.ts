/**
 * Shared "## Skills" block for renderer runtimes (agent chat, canvas executor, etc.)
 */
export interface SkillLike {
  id: string;
  name: string;
  prompt: string;
  enabled?: boolean;
}

const DEFAULT_MAX_BODY_CHARS = 100_000;

export interface AppendSkillsMarkdownOptions {
  /** Per-skill body cap to avoid blowing the agent context window (default 100000). */
  maxBodyChars?: number;
}

export function appendSkillsMarkdown(
  base: string,
  skillIds: string[] | undefined,
  skills: SkillLike[],
  options?: AppendSkillsMarkdownOptions,
): string {
  const t = base.trimEnd();
  if (!skillIds?.length || !skills.length) return t;
  const maxBody = typeof options?.maxBodyChars === 'number' && options.maxBodyChars > 500 ? options.maxBodyChars : DEFAULT_MAX_BODY_CHARS;

  const chunks: string[] = [];
  for (const id of skillIds) {
    const s = skills.find((x) => x.id === id);
    if (!s || s.enabled === false) continue;
    const body = (s.prompt || '').trim();
    if (!body) continue;
    if (body.length > maxBody) {
      throw new Error(`Skill ${s.name} exceeds the available instruction budget (${maxBody} characters).`);
    }
    chunks.push(`### ${s.name || 'Skill'}\n${body}\n`);
  }
  if (chunks.length === 0) return t;
  return `${t}\n\n## Skills\n${chunks.join('\n')}`;
}
