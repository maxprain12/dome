import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckListIcon, CheckmarkCircle02Icon, CircleDotIcon, CircleIcon } from '@hugeicons/core-free-icons';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { TodoItem, TodoStatus } from '@/lib/chat/todos';

function StatusIcon({ status }: { status: TodoStatus }) {
  if (status === 'completed') {
    return <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 shrink-0 text-success" aria-hidden />;
  }
  if (status === 'in_progress') {
    return <Spinner className="size-4 shrink-0 text-primary" aria-hidden />;
  }
  return <HugeiconsIcon icon={CircleIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
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
    <Card className={cn('w-full min-w-0 max-w-full gap-0 overflow-hidden py-0', className)}>
      {/* Header */}
      <CardHeader className="flex flex-row items-center gap-2.5 px-3 py-2.5">
        <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', allDone ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
          <HugeiconsIcon icon={CheckListIcon} className="size-4" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate text-foreground">
            {t('chat.todo_list_title', { defaultValue: 'Plan de tareas' })}
          </div>
          {activeLabel ? (
            <div className="text-[11.5px] truncate text-muted-foreground">
              {activeLabel}
            </div>
          ) : null}
        </div>
        <span className={cn('shrink-0 text-[11px] font-medium tabular-nums', allDone ? 'text-success' : 'text-muted-foreground')}>
          {completed}/{total}
        </span>
      </CardHeader>

      {/* Progress bar */}
      <Progress value={pct} className={cn('h-1 rounded-none', allDone && '[&_[data-slot=progress-indicator]]:bg-success')} />

      {/* Items */}
      <CardContent className="px-0 py-1.5"><ul className="flex flex-col">
        {todos.map((td, i) => (
          <li
            key={`${i}-${td.content.slice(0, 24)}`}
            className="flex items-start gap-2.5 px-3 py-1.5"
          >
            <span className="mt-px">
              <StatusIcon status={td.status} />
            </span>
            <span className={cn('break-words text-[12.5px] leading-snug text-muted-foreground', td.status === 'completed' && 'line-through', td.status === 'in_progress' && 'font-semibold')}>
              {td.content}
            </span>
            {td.status === 'in_progress' ? (
              <HugeiconsIcon
                icon={CircleDotIcon}
                className="ml-auto mt-0.5 size-3 shrink-0 animate-pulse text-primary motion-reduce:animate-none"
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ul></CardContent>
    </Card>
  );
}
