export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

/** Coerce the loosely-typed `arguments.todos` into a clean TodoItem[]. */
export function parseTodos(args: Record<string, unknown> | undefined): TodoItem[] {
  const raw = args?.todos;
  if (!Array.isArray(raw)) return [];
  const out: TodoItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const content =
      typeof obj.content === 'string'
        ? obj.content
        : typeof obj.description === 'string'
          ? obj.description
          : '';
    if (!content.trim()) continue;
    const status: TodoStatus =
      obj.status === 'in_progress' || obj.status === 'completed' ? obj.status : 'pending';
    out.push({ content, status });
  }
  return out;
}
