import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Circle, CircleDot, CheckCircle2, Loader2 } from 'lucide-react';

/**
 * ChatTodoList — dedicated renderer for the agent's `write_todos` tool call.
 *
 * Instead of a generic JSON tool card, it shows the agent's plan as a live
 * checklist with per-item status (pending / in_progress / completed) and a
 * progress bar, following the Dome design system (CSS variable tokens).
 */

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

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} aria-hidden />;
  }
  if (status === 'in_progress') {
    return <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: 'var(--accent)' }} aria-hidden />;
  }
  return <Circle className="size-4 shrink-0" style={{ color: 'var(--tertiary-text)' }} aria-hidden />;
}

interface ChatTodoListProps {
  todos: TodoItem[];
  className?: string;
}

export default function ChatTodoList({ todos, className = '' }: ChatTodoListProps) {
  const { t } = useTranslation();

  const { completed, total, activeLabel } = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((td) => td.status === 'completed').length;
    const active = todos.find((td) => td.status === 'in_progress');
    return { completed, total, activeLabel: active?.content ?? null };
  }, [todos]);

  if (total === 0) return null;

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = completed === total;

  return (
    <div
      className={`w-full min-w-0 max-w-full rounded-xl border overflow-hidden ${className}`.trim()}
      style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          className="flex items-center justify-center size-7 rounded-md shrink-0"
          style={{
            background: allDone ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
            color: allDone ? 'var(--accent)' : 'var(--secondary-text)',
          }}
        >
          <ListChecks className="size-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--primary-text)' }}>
            {t('chat.todo_list_title', { defaultValue: 'Plan de tareas' })}
          </div>
          {activeLabel ? (
            <div className="text-[11.5px] truncate" style={{ color: 'var(--tertiary-text)' }}>
              {activeLabel}
            </div>
          ) : null}
        </div>
        <span
          className="text-[11px] font-medium tabular-nums shrink-0"
          style={{ color: allDone ? 'var(--success)' : 'var(--secondary-text)' }}
        >
          {completed}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] w-full" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: allDone ? 'var(--success)' : 'var(--accent)',
          }}
        />
      </div>

      {/* Items */}
      <ul className="flex flex-col py-1.5">
        {todos.map((td, i) => (
          <li
            key={`${i}-${td.content.slice(0, 24)}`}
            className="flex items-start gap-2.5 px-3 py-1.5"
          >
            <span className="mt-px">
              <StatusIcon status={td.status} />
            </span>
            <span
              className="text-[12.5px] leading-snug break-words"
              style={{
                color: td.status === 'completed' ? 'var(--tertiary-text)' : 'var(--secondary-text)',
                textDecoration: td.status === 'completed' ? 'line-through' : 'none',
                fontWeight: td.status === 'in_progress' ? 600 : 400,
              }}
            >
              {td.content}
            </span>
            {td.status === 'in_progress' ? (
              <CircleDot
                className="size-3 shrink-0 ml-auto mt-0.5 animate-pulse"
                style={{ color: 'var(--accent)' }}
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
