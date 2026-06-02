/**
 * Resolve slash skill tokens (/pptx, /advo-identity) and sticky/one-shot picks
 * into SKILL.md bodies for injection into the run system prompt.
 */
import { appendSkillsMarkdown, type SkillLike } from '@/lib/skills/append-markdown';
import { listSkills } from '@/lib/skills/client';

const SLASH_SKILL_RE = /(?:^|\s)\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(?=\s|$|[.,!?;:])/g;

export function extractSlashSkillLabels(text: string): string[] {
  const labels: string[] = [];
  for (const match of text.matchAll(SLASH_SKILL_RE)) {
    if (match[1]) labels.push(match[1]);
  }
  return [...new Set(labels)];
}

function stripSkillFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

function resolveSkillMeta(
  ref: string,
  catalog: Array<{ id: string; name: string; slug: string }>,
): { id: string; name: string; slug: string } | null {
  const key = ref.toLowerCase();
  return (
    catalog.find(
      (skill) =>
        skill.id.toLowerCase() === key ||
        skill.name.toLowerCase() === key ||
        skill.slug.toLowerCase() === key,
    ) ?? null
  );
}

export interface ResolveRunSkillsOptions {
  messageText: string;
  pendingOneShotSkillId?: string | null;
  activeStickySkillId?: string | null;
}

export async function loadSkillsForRun(options: ResolveRunSkillsOptions): Promise<SkillLike[]> {
  const listRes = await listSkills();
  if (!listRes.success || !listRes.data?.length) return [];

  const catalog = listRes.data;
  const resolvedRefs = new Set<string>();

  for (const id of [options.pendingOneShotSkillId, options.activeStickySkillId]) {
    if (id) resolvedRefs.add(id);
  }

  for (const label of extractSlashSkillLabels(options.messageText)) {
    resolvedRefs.add(label);
  }

  if (resolvedRefs.size === 0) return [];

  const skills: SkillLike[] = [];
  const seenFolderIds = new Set<string>();

  for (const ref of resolvedRefs) {
    const meta = resolveSkillMeta(ref, catalog);
    if (!meta || seenFolderIds.has(meta.id)) continue;
    seenFolderIds.add(meta.id);
    try {
      const res = (await window.electron.invoke('skills:readFile', {
        skillId: meta.id,
        path: 'SKILL.md',
      })) as { success?: boolean; data?: { content?: string } };
      if (!res?.success || !res.data?.content?.trim()) continue;
      skills.push({
        id: meta.id,
        name: meta.name,
        prompt: stripSkillFrontmatter(res.data.content),
      });
    } catch {
      /* skip unreadable skill */
    }
  }
  return skills;
}

export async function appendRunSkillsToPrompt(
  basePrompt: string,
  options: ResolveRunSkillsOptions,
): Promise<string> {
  const skills = await loadSkillsForRun(options);
  if (skills.length === 0) return basePrompt;
  const ids = skills.map((s) => s.id);
  const maxBodyChars = skills.length > 1 ? 2400 : 3800;
  const withSkills = appendSkillsMarkdown(basePrompt, ids, skills, { maxBodyChars });
  return `${withSkills}\n\n## Skill invocation note\nThe user explicitly invoked the skill(s) above via /slash tokens. Their SKILL.md bodies are already loaded — follow them for this run. Do NOT call skill_read for SKILL.md or search the library for /skill-name paths. Use skill_read only for auxiliary files referenced inside a skill (e.g. references/pptx.md).`;
}
