/**
 * Normalize skill records from JSON imports (prompt vs instructions vs body) for ai_skills / UI.
 */
export interface NormalizedSkillInput {
  id: string;
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
}

function pickPrompt(raw: Record<string, unknown>): string {
  if (typeof raw.prompt === 'string' && raw.prompt.trim()) return raw.prompt.trim();
  if (typeof raw.instructions === 'string' && raw.instructions.trim()) return raw.instructions.trim();
  if (typeof raw.body === 'string' && raw.body.trim()) return raw.body.trim();
  if (typeof raw.content === 'string' && raw.content.trim()) return raw.content.trim();
  return '';
}

export function normalizeSkillImportRecord(raw: Record<string, unknown>, index: number): NormalizedSkillInput | null {
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : id || `skill_${index + 1}`;
  if (!id && !name) return null;
  const prompt = pickPrompt(raw);
  const description = typeof raw.description === 'string' ? raw.description : '';
  const enabled = raw.enabled !== false;
  return {
    id: id || name,
    name,
    description,
    prompt,
    enabled,
  };
}

export function normalizeSkillImportArray(parsed: unknown): NormalizedSkillInput[] {
  const arr = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? [parsed as Record<string, unknown>] : [];
  const out: NormalizedSkillInput[] = [];
  arr.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const n = normalizeSkillImportRecord(item as Record<string, unknown>, i);
    if (n) out.push(n);
  });
  return out;
}
