import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Alert02Icon, Folder01Icon, GlobalIcon, Refresh01Icon, RepeatIcon, SentIcon, PauseIcon, PlayCircleIcon } from '@hugeicons/core-free-icons';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { delegateToMany, request, type Action, type CloudMany, type ManyDetail, type Task } from '@/lib/manys/api';
import ManyMark, { manyMarkVariant } from './ManyMark';
import ManyOptionsMenu from './ManyOptionsMenu';
import { retryTask, setManyPaused, STATUS_DOT, statusLabelKey, summarizeMany } from './manyStatus';

export const MANY_TEMPLATES = ['person', 'competitor', 'meeting'] as const;
export type ManyTemplate = (typeof MANY_TEMPLATES)[number];

type Need =
  | { kind: 'approval'; many: CloudMany; action: Action }
  | { kind: 'reconcile'; many: CloudMany; action: Action }
  | { kind: 'conflict'; many: CloudMany; conflict: ManyDetail['conflicts'][number] }
  | { kind: 'question'; many: CloudMany; task: Task }
  | { kind: 'failed'; many: CloudMany; task: Task };

interface ManysOverviewProps {
  manys: CloudMany[];
  details: Record<string, ManyDetail | undefined>;
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (many: CloudMany) => void;
  onTemplate: (template: ManyTemplate) => void;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}

function operationOf(proposal: unknown): string {
  if (proposal && typeof proposal === 'object' && 'operation' in proposal) {
    const value = (proposal as { operation: unknown }).operation;
    return typeof value === 'string' ? value : '';
  }
  return '';
}

export default function ManysOverview({ manys, details, busy, onOpen, onNew, onDelete, onTemplate, perform }: ManysOverviewProps) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const summaries = manys.map((many) => {
    const detail = details[many.id];
    return { many, detail, summary: detail ? summarizeMany(detail) : null };
  });
  const count = (match: (status: string) => boolean) => summaries.filter((item) => item.summary && match(item.summary.status)).length;
  const routines = summaries.reduce((total, item) => total + (item.detail?.recurrences.length ?? 0), 0);

  const needs: Need[] = [];
  for (const { many, detail, summary } of summaries) {
    if (!detail || !summary) continue;
    for (const action of summary.decisions) needs.push({ kind: action.state === 'pending' ? 'approval' : 'reconcile', many, action });
    for (const conflict of summary.conflicts) needs.push({ kind: 'conflict', many, conflict });
    for (const task of summary.questions) needs.push({ kind: 'question', many, task });
    if (summary.lastFailed) needs.push({ kind: 'failed', many, task: summary.lastFailed });
  }

  const cards = [
    { key: 'working', label: t('manys.summary.working'), value: count((s) => s === 'running'), dot: 'bg-success' },
    { key: 'attention', label: t('manys.summary.attention'), value: count((s) => s === 'waiting_approval' || s === 'waiting_input'), dot: 'bg-warning' },
    { key: 'failed', label: t('manys.summary.failed'), value: count((s) => s === 'failed'), dot: 'bg-destructive' },
    { key: 'routines', label: t('manys.summary.routines'), value: routines, dot: '' },
  ];

  const patch = (path: string, body: Record<string, unknown>) => perform(() => request(path, 'PATCH', body));

  const needText = (need: Need): { title: string; detail: string } => {
    switch (need.kind) {
      case 'approval': return { title: t('manys.needs.approval'), detail: operationOf(need.action.proposal) };
      case 'reconcile': return { title: t('manys.needs.reconcile'), detail: t('manys.reconcileHint') };
      case 'conflict': return { title: t('manys.needs.conflict'), detail: need.conflict.title ?? '' };
      case 'question': return { title: t('manys.needs.question'), detail: need.task.question ?? '' };
      case 'failed': return { title: t('manys.needs.failed'), detail: need.task.prompt };
    }
  };

  const needButtons = (need: Need) => {
    const many = need.many.id;
    switch (need.kind) {
      case 'approval':
        return (
          <>
            <Button size="sm" disabled={busy} onClick={() => { void patch(`/${many}/actions/${need.action.id}`, { approve: true, digest: need.action.digest }); }}>{t('manys.approve')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void patch(`/${many}/actions/${need.action.id}`, { approve: false, digest: need.action.digest }); }}>{t('manys.reject')}</Button>
          </>
        );
      case 'conflict':
        return (
          <>
            <Button size="sm" disabled={busy} onClick={() => { void patch(`/${many}/conflicts/${need.conflict.id}`, { apply: true, expectedRevision: Number(need.conflict.current_revision) }); }}>{t('manys.applyProposal')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { void patch(`/${many}/conflicts/${need.conflict.id}`, { apply: false, expectedRevision: Number(need.conflict.current_revision) }); }}>{t('manys.keepCurrent')}</Button>
          </>
        );
      case 'failed':
        return (
          <>
            <Button size="sm" disabled={busy} onClick={() => { void perform(() => retryTask(many, need.task)); }}><HugeiconsIcon icon={Refresh01Icon} aria-hidden />{t('manys.retry')}</Button>
            <Button size="sm" variant="outline" onClick={() => onOpen(many)}>{t('manys.viewDetail')}</Button>
          </>
        );
      default:
        return <Button size="sm" variant="outline" onClick={() => onOpen(many)}>{t('manys.open')}</Button>;
    }
  };

  // One switch for the whole team: stop everyone, or let everyone work again.
  const anyWorking = manys.some((many) => many.grants.paused !== true);

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-8 pt-8 pb-10">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 grow flex-col gap-1">
          <h1 className="text-2xl/[1.3] font-semibold tracking-tight">{t('manys.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('manys.intro')}</p>
        </div>
        {manys.length > 0 && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => { void perform(() => Promise.all(manys.map((many) => setManyPaused(many, anyWorking)))); }}>
            <HugeiconsIcon icon={anyWorking ? PauseIcon : PlayCircleIcon} aria-hidden />
            {t(anyWorking ? 'manys.pause.pauseAll' : 'manys.pause.resumeAll')}
          </Button>
        )}
        <Button type="button" onClick={onNew}>
          <HugeiconsIcon icon={Add01Icon} aria-hidden />
          {t('manys.newMany')}
        </Button>
      </header>

      <section aria-label={t('manys.summary.label')} className="flex flex-wrap gap-3">
        {cards.map((card) => (
          <div key={card.key} className="dome-card flex min-w-[200px] grow flex-col gap-0.5 px-4 py-3.5">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {card.dot
                ? <span aria-hidden="true" className={cn('size-[7px] rounded-full', card.dot)} />
                : <HugeiconsIcon icon={RepeatIcon} className="size-3" aria-hidden />}
              {card.label}
            </span>
            <span className="text-[28px]/[1.2] font-semibold tracking-[-0.02em] tabular-nums">{card.value}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1.6_1_520px] flex-col gap-2.5">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('manys.needsYou', { count: needs.length })}</h2>
          <div className="dome-card flex flex-col py-1">
            {needs.length === 0 && <p className="px-4 py-5 text-sm text-muted-foreground">{t('manys.needsNothing')}</p>}
            {needs.map((need, index) => {
              const text = needText(need);
              return (
                <div key={`${need.kind}-${need.many.id}-${index}`} className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
                  <ManyMark variant={manyMarkVariant(need.many.id)} className="size-6" />
                  <div className="flex min-w-0 grow basis-56 flex-col text-sm">
                    <span><strong className="font-semibold">{need.many.name}</strong> {text.title}</span>
                    {text.detail && <span className="truncate text-xs text-muted-foreground">{text.detail}</span>}
                  </div>
                  <div className="flex items-center gap-2">{needButtons(need)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5">
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('manys.templatesTitle')}</h2>
          <div className="dome-card flex flex-col py-1">
            {MANY_TEMPLATES.map((template) => (
              <div key={template} className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0">
                <div className="flex min-w-0 grow flex-col text-sm">
                  <span className="font-medium">{t(`manys.templates.${template}.title`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`manys.templates.${template}.desc`)}</span>
                </div>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => onTemplate(template)}>{t('manys.useTemplate')}</Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('manys.teamTitle', { count: manys.length })}</h2>
        <div className="flex flex-wrap items-stretch gap-3">
          {summaries.map(({ many, detail, summary }) => {
            const status = summary?.status ?? 'idle';
            const lastTask = detail?.tasks[0];
            const capabilities = many.grants.capabilities;
            const draft = drafts[many.id] ?? '';
            const routine = detail?.recurrences[0];
            const badgeVariant = status === 'failed' ? 'err' : status === 'running' || status === 'idle' ? 'ok' : 'warn';
            return (
              <article key={many.id} className="dome-card flex min-w-0 flex-[1_1_480px] flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <ManyMark variant={manyMarkVariant(many.id)} className="size-10" />
                  <div className="flex min-w-0 grow flex-col">
                    <h3 className="truncate text-sm font-semibold tracking-[-0.01em]">{many.name}</h3>
                    {lastTask && <span className="truncate text-xs text-muted-foreground">{lastTask.prompt}</span>}
                  </div>
                  {summary && (
                    <Badge variant={badgeVariant}>
                      <span aria-hidden="true" className={cn('size-[7px] rounded-full', STATUS_DOT[status])} />
                      {t(statusLabelKey(status))}
                    </Badge>
                  )}
                  <ManyOptionsMenu many={many} onDelete={onDelete} />
                </div>
                {summary?.lastFailed && (
                  <div className="flex items-center gap-2 rounded-[10px] bg-muted px-2.5 py-2 text-xs">
                    <HugeiconsIcon icon={Alert02Icon} className="size-3 shrink-0 text-destructive" aria-hidden />
                    <span className="min-w-0 grow">{t('manys.failedStrip')}</span>
                    <Button size="xs" variant="outline" disabled={busy} onClick={() => { if (summary.lastFailed) void perform(() => retryTask(many.id, summary.lastFailed as Task)); }}>
                      <HugeiconsIcon icon={Refresh01Icon} aria-hidden />
                      {t('manys.retry')}
                    </Button>
                  </div>
                )}
                {routine && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <HugeiconsIcon icon={RepeatIcon} className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{routine.prompt}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {many.grants.projects.length > 0 && (
                    <Badge variant="outline"><HugeiconsIcon icon={Folder01Icon} className="size-3" aria-hidden />{t('manys.capProjects', { count: many.grants.projects.length })}</Badge>
                  )}
                  {capabilities.some((id) => id.startsWith('computer.')) && <Badge variant="outline">{t('manys.computer.title')}</Badge>}
                  {capabilities.some((id) => id.startsWith('external.')) && (
                    <Badge variant="outline"><HugeiconsIcon icon={GlobalIcon} className="size-3" aria-hidden />{t('manys.capExternal')}</Badge>
                  )}
                </div>
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!draft.trim()) return;
                    void perform(() => delegateToMany(many.id, draft)).then(() => setDrafts((current) => ({ ...current, [many.id]: '' })));
                  }}
                >
                  <Input
                    value={draft}
                    maxLength={50000}
                    aria-label={t('manys.delegateTo', { name: many.name })}
                    placeholder={t('manys.delegateTo', { name: many.name })}
                    className="grow"
                    onChange={(event) => setDrafts((current) => ({ ...current, [many.id]: event.target.value }))}
                  />
                  <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label={t('manys.send')} title={t('manys.send')}>
                    <HugeiconsIcon icon={SentIcon} />
                  </Button>
                  <Button type="button" variant="outline" onClick={() => onOpen(many.id)}>{t('manys.open')}</Button>
                </form>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
