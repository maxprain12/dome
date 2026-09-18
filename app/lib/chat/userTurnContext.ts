import { extractSlashSkillLabels } from '@/lib/skills/resolve-run-skills';

const USE_THESE_SKILLS_RE = /(?:^|\n)\s*Use these skills:\s*([^\n]+)/gi;
const SLASH_SKILL_TOKEN_RE = /(?:^|\s)\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(?=\s|$|[.,!?;:])/g;

export type UserTurnSkillChip = {
  id: string;
  name: string;
};

function humanSkillName(raw: string): string | null {
  const name = raw.replace(/\.+$/, '').trim();
  if (!name) return null;
  return name;
}

export function parseUseTheseSkillsLine(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(USE_THESE_SKILLS_RE)) {
    const chunk = match[1] || '';
    for (const part of chunk.split(',')) {
      const name = humanSkillName(part);
      if (name) names.push(name);
    }
  }
  return [...new Set(names)];
}

/** Visible user-bubble text: no slash tokens and no "Use these skills" log line. */
export function stripSkillInvocationText(content: string): string {
  if (!content) return '';
  let out = content.replace(USE_THESE_SKILLS_RE, '\n');
  out = out.replace(SLASH_SKILL_TOKEN_RE, (token) => (token.startsWith('/') ? '' : ' '));
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

export function skillChipsFromUserTurn(
  content: string | undefined,
  skills?: UserTurnSkillChip[] | null,
): UserTurnSkillChip[] {
  const out: UserTurnSkillChip[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string) => {
    const label = humanSkillName(name) || humanSkillName(id);
    if (!label) return;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: id || label, name: label });
  };
  for (const skill of skills ?? []) {
    push(skill.id, skill.name);
  }
  for (const name of extractSlashSkillLabels(content || '')) {
    push(name, name);
  }
  for (const name of parseUseTheseSkillsLine(content || '')) {
    push(name, name);
  }
  return out;
}
