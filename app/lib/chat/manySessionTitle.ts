/** Avoid markdown images / JSON blobs as session titles in the sidebar. */
export function sanitizeManySessionTitle(text: string): string {
  let s = String(text || '').trim();
  if (!s) return 'New chat';
  s = s
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{"tools"[\s\S]*?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstLine = s.split('\n').map((line) => line.trim()).find(Boolean) ?? s;
  const title = firstLine.slice(0, 50).trim();
  return title || 'New chat';
}

const TRIVIAL_TITLE_RE =
  /^(hola|hi|hey|hello|buenas?|buenos?\s*d[ií]as?|test|prueba|ok|vale|thanks|gracias|saludos)[\s!.?,:]*$/i;

/** Greetings / filler that make poor sidebar titles when used alone. */
export function isTrivialManySessionTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t === 'New chat') return true;
  return TRIVIAL_TITLE_RE.test(t);
}

/** Pick a sidebar title from stored meta + message history (skip trivial greetings). */
export function deriveManySessionTitle(input: {
  storedTitle?: string | null;
  messages?: Array<{ role: string; content: string }>;
  firstUser?: string;
}): string {
  const stored = input.storedTitle?.trim();
  if (stored && stored !== 'New chat' && !isTrivialManySessionTitle(stored)) {
    return sanitizeManySessionTitle(stored);
  }

  const messages = input.messages ?? [];
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const candidate = sanitizeManySessionTitle(m.content);
    if (candidate !== 'New chat' && !isTrivialManySessionTitle(candidate)) {
      return candidate;
    }
  }

  for (const m of messages) {
    if (m.role !== 'assistant' || !m.content?.trim()) continue;
    const candidate = sanitizeManySessionTitle(m.content);
    if (candidate !== 'New chat' && !isTrivialManySessionTitle(candidate)) {
      return candidate;
    }
  }

  const fallback = input.firstUser ?? messages.find((m) => m.role === 'user')?.content ?? '';
  return sanitizeManySessionTitle(fallback);
}
