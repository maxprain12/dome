import { Input } from '@/components/ui/input';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { HugeiconsIcon } from '@hugeicons/react';
import { Activity01Icon, AtSignIcon, Calendar03Icon, Cancel01Icon, CheckmarkCircle02Icon, CircleDotIcon, Comment01Icon, ExternalLinkIcon, Flag02Icon, HashIcon, PencilIcon, SaveIcon, SentIcon, Target02Icon, UserAdd01Icon, UserIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import IssueTimeline from '@/components/github/IssueTimeline';
import MentionTextarea, { type Mentionable } from '@/components/github/MentionTextarea';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command } from '@/components/ui/command';
function formatCommentDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function parseAssignees(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function IssueCommentCard({ comment }: { comment: GitHubIssueCommentRow }) {
  const { t } = useTranslation();
  return (
    <article
      className="rounded-lg px-3 py-3 flex flex-col gap-2"
      style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {comment.user_avatar ? (
            <img
              src={comment.user_avatar}
              alt=""
              className="size-6 rounded-full shrink-0"
              style={{ border: '1px solid var(--border)' }}
            />
          ) : null}
          <span className="text-sm font-medium truncate text-foreground">
            {comment.user || t('github.anonymous_user')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {comment.created_at ? (
            <time className="text-[11px] text-muted-foreground" dateTime={new Date(comment.created_at).toISOString()}>
              {formatCommentDate(comment.created_at)}
            </time>
          ) : null}
          {comment.html_url ? (
            <a href={comment.html_url} target="_blank" rel="noreferrer" title={t('github.open_on_github')} className="text-muted-foreground">
              <HugeiconsIcon icon={ExternalLinkIcon} size={13} />
            </a>
          ) : null}
        </div>
      </div>
      {comment.body.trim() ? (
        <GithubMarkdownBody content={comment.body} className="text-sm" />
      ) : (
        <p className="text-sm italic text-muted-foreground">{t('github.empty_comment')}</p>
      )}
    </article>
  );
}

interface AssigneeAvatarProps {
  login: string;
  avatarUrl: string | null;
  size?: number;
  onRemove?: () => void;
}

function AssigneeAvatar({ login, avatarUrl, size = 22, onRemove }: AssigneeAvatarProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full pl-0.5 pr-2 shrink-0"
      style={{
        background: 'var(--accent)',
        border: '1px solid var(--border)',
        height: size + 6,
        color: 'var(--foreground)',
      }}
      title={onRemove ? `@${login}` : undefined}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="rounded-full shrink-0"
          style={{ width: size, height: size, border: '1px solid var(--border)' }}
        />
      ) : (
        <span
          className="rounded-full inline-flex items-center justify-center font-semibold shrink-0"
          style={{
            width: size,
            height: size,
            background: 'var(--background)',
            color: 'var(--muted-foreground)',
            fontSize: size * 0.45,
          }}
        >
          {login.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="text-xs font-medium truncate max-w-[120px]">{login}</span>
      {onRemove && (
        <Button
          type="button"
          onClick={onRemove}
          aria-label={`@${login}`}
          className="shrink-0 inline-flex items-center justify-center rounded-full"
          style={{
            width: 14,
            height: 14,
            background: 'transparent',
            border: 'none',
            color: 'var(--muted-foreground)',
            cursor: 'pointer',
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={10} />
        </Button>
      )}
    </span>
  );
}

/**
 * Issue detail as a modal. Two tabs in view mode (Comments / Activity), and an
 * edit form that lets the user change title, milestone, assignees (with
 * `@`-autocomplete), state and body — all with mention support.
 */
export default function IssueDetailPanel({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const issues = useGitHubStore((s) => s.issues);
  const milestones = useGitHubStore((s) => s.milestones);
  const initial = issues.find((i) => i.id === issueId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [state, setState] = useState<'open' | 'closed'>(initial?.state ?? 'open');
  const [milestoneChoice, setMilestoneChoice] = useState<string>(
    initial?.milestone_number != null ? String(initial.milestone_number) : 'none',
  );
  const [assignees, setAssignees] = useState<string[]>(() => parseAssignees(initial?.assignees));
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'comments' | 'timeline'>('comments');
  const [comments, setComments] = useState<GitHubIssueCommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [timeline, setTimeline] = useState<GitHubTimelineEvent[]>([]);
  const [apiMentionables, setApiMentionables] = useState<Mentionable[]>([]);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [assigneePickerQuery, setAssigneePickerQuery] = useState('');
  const assigneePickerRef = useRef<HTMLInputElement>(null);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const res = await githubClient.issues.listComments(issueId);
      if (!res.success) {
        setCommentsError(res.error || t('github.error_load_comments'));
        setComments([]);
      } else {
        setComments(res.comments ?? []);
      }
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : t('github.error_load_comments'));
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [issueId, t]);

  const loadTimeline = useCallback(async () => {
    try {
      const res = await githubClient.issues.listTimeline(issueId);
      setTimeline(res.success ? res.timeline ?? [] : []);
    } catch {
      setTimeline([]);
    }
  }, [issueId]);

  const prevIssueIdRef = useRef(issueId);
  if (issueId !== prevIssueIdRef.current) {
    prevIssueIdRef.current = issueId;
    if (initial) {
      setTitle(initial.title);
      setBody('');
      setState(initial.state);
      setMilestoneChoice(initial.milestone_number != null ? String(initial.milestone_number) : 'none');
      setAssignees(parseAssignees(initial.assignees));
      setEditing(false);
      setNewComment('');
      setAssigneePickerOpen(false);
      setAssigneePickerQuery('');
      setTab('comments');
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await githubClient.issues.get(issueId);
      if (cancelled || !res.success || !res.issue) return;
      setTitle(res.issue.title);
      setBody(res.issue.body ?? '');
      setState(res.issue.state);
      setMilestoneChoice(res.issue.milestone_number != null ? String(res.issue.milestone_number) : 'none');
      setAssignees(parseAssignees(res.issue.assignees));
    })();

    return () => {
      cancelled = true;
    };
  }, [issueId, initial]);

  const prevCommentsLoadKeyRef = useRef('');
  const commentsLoadKey = `${issueId}:${editing}`;
  if (!editing && commentsLoadKey !== prevCommentsLoadKeyRef.current) {
    prevCommentsLoadKeyRef.current = commentsLoadKey;
    void loadComments();
    void loadTimeline();
  }

  const prevMentionablesIssueIdRef = useRef(issueId);
  if (issueId !== prevMentionablesIssueIdRef.current) {
    prevMentionablesIssueIdRef.current = issueId;
    void (async () => {
      const res = await githubClient.issues.listMentionables(issueId);
      setApiMentionables(res.success ? res.users ?? [] : []);
    })();
  }

  const mentionables = useMemo(() => {
    const byLogin = new Map<string, Mentionable>();
    for (const u of apiMentionables) {
      byLogin.set(u.login, u);
    }
    for (const c of comments) {
      if (c.user && !byLogin.has(c.user)) {
        byLogin.set(c.user, { login: c.user, avatar_url: c.user_avatar });
      }
    }
    for (const ev of timeline) {
      if (ev.actor && !byLogin.has(ev.actor)) {
        byLogin.set(ev.actor, { login: ev.actor, avatar_url: ev.actor_avatar });
      }
    }
    return [...byLogin.values()].sort((a, b) => a.login.localeCompare(b.login));
  }, [apiMentionables, comments, timeline]);

  const openAssigneePicker = () => {
    setAssigneePickerOpen(true);
    requestAnimationFrame(() => assigneePickerRef.current?.focus());
  };

  const featuredLogins = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignees) set.add(a.toLowerCase());
    for (const c of comments) if (c.user) set.add(c.user.toLowerCase());
    for (const ev of timeline) if (ev.actor) set.add(ev.actor.toLowerCase());
    return [...set];
  }, [assignees, comments, timeline]);

  const assignedSet = useMemo(() => new Set(assignees.map((a) => a.toLowerCase())), [assignees]);

  const assigneeSuggestions = useMemo(() => {
    const q = assigneePickerQuery.trim().toLowerCase();
    const out: typeof mentionables = [];
    for (const u of mentionables) {
      if (assignedSet.has(u.login.toLowerCase())) continue;
      if (q && !u.login.toLowerCase().includes(q)) continue;
      out.push(u);
      if (out.length >= 8) break;
    }
    return out;
  }, [mentionables, assignedSet, assigneePickerQuery]);

  if (!initial) return null;

  const labels = parseLabels(initial.labels);
  const stateLabel = initial.state === 'open' ? t('github.state_open') : t('github.state_closed');
  const milestone = initial.milestone_number != null
    ? milestones.find((m) => m.number === initial.milestone_number)
    : null;
  const initialAssignees = parseAssignees(initial.assignees);
  const handleRemoveAssignee = (login: string) =>
    setAssignees((prev) => prev.filter((a) => a !== login));

  const save = async () => {
    setSaving(true);
    const milestoneNumber = milestoneChoice === 'none'
      ? null
      : Number(milestoneChoice);
    await githubClient.issues.update(issueId, {
      title,
      body,
      state,
      milestoneNumber,
      assignees,
    });
    setSaving(false);
    setEditing(false);
  };

  const toggleState = async () => {
    await githubClient.issues.move(issueId, { state: initial.state === 'open' ? 'closed' : 'open' });
  };

  const postComment = async () => {
    const text = newComment.trim();
    if (!text || postingComment) return;
    setPostingComment(true);
    try {
      const res = await githubClient.issues.createComment(issueId, text);
      if (!res.success || !res.comment) {
        setCommentsError(res.error || t('github.error_post_comment'));
        return;
      }
      setComments((prev) => [...prev, res.comment!]);
      setNewComment('');
      setCommentsError(null);
    } catch (err) {
      setCommentsError(err instanceof Error ? err.message : t('github.error_post_comment'));
    } finally {
      setPostingComment(false);
    }
  };

  const headerActions = (
    <div className="flex items-center gap-1.5">
      {initial.html_url && (
        <Button variant="ghost"
  aria-label={t('github.open_on_github')}
  onClick={() => window.open(initial.html_url!, '_blank', 'noreferrer')}
  size="icon-sm">
          <HugeiconsIcon icon={ExternalLinkIcon} size={14} />
        </Button>
      )}
      <Button variant="outline"
  onClick={toggleState}
  size="sm">{initial.state === 'open' ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={13} /> : <HugeiconsIcon icon={CircleDotIcon} size={13} />}
        {initial.state === 'open' ? t('github.close') : t('github.reopen')}
      </Button>
      {!editing && (
        <Button onClick={() => setEditing(true)}
  size="sm">{<HugeiconsIcon icon={PencilIcon} size={13} />}
          {t('github.edit')}
        </Button>
      )}
    </div>
  );

  const footer = editing ? (
    <div className="flex items-center justify-end gap-2 w-full">
      <Button variant="outline"
  onClick={() => setEditing(false)}
  size="sm">{<HugeiconsIcon icon={Cancel01Icon} size={13} />}
        {t('github.cancel')}
      </Button>
      <Button disabled={saving}
  onClick={() => void save()}
  size="sm">{saving ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />}
        {t('github.save_sync')}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-2 w-full">
      <Button disabled={!newComment.trim() || postingComment}
  onClick={() => void postComment()}
  size="sm">{postingComment ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />}
        {t('github.post_comment')}
      </Button>
    </div>
  );

  return (
    <Sheet open onOpenChange={(next) => { if (!next) (onClose)(); }}><SheetContent className="flex h-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"><SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3 pr-12"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><SheetTitle className="truncate">{t('github.issue_title', { number: initial.number })}</SheetTitle></div></div><div className="flex shrink-0 items-center gap-2">{headerActions}</div></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="issue-edit-title"
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t('github.minimal_quick_title_label')}
            </label>
            <Input
              id="issue-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-semibold rounded-md px-2.5 py-1.5 outline-none"
              style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
            />
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <label
                htmlFor="issue-edit-milestone"
                className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1 text-muted-foreground"
              >
                <HugeiconsIcon icon={Flag02Icon} size={11} />
                {t('github.milestone')}
              </label>
              <Select value={milestoneChoice ?? null} onValueChange={(next) => { if (next != null) (setMilestoneChoice)(next); }} items={[
                  { value: 'none', label: t('github.no_milestone_label') },
                  ...(() => {
                    const opts: { value: string; label: string }[] = [];
                    for (const m of milestones) {
                      if (m.state !== 'open') continue;
                      opts.push({ value: String(m.number), label: m.title });
                    }
                    return opts;
                  })(),
                ]}><SelectTrigger className="w-full" aria-label={t('github.milestone')}><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
                  { value: 'none', label: t('github.no_milestone_label') },
                  ...(() => {
                    const opts: { value: string; label: string }[] = [];
                    for (const m of milestones) {
                      if (m.state !== 'open') continue;
                      opts.push({ value: String(m.number), label: m.title });
                    }
                    return opts;
                  })(),
                ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select>
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <label
                htmlFor="issue-edit-state"
                className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {t('github.state_open')} / {t('github.state_closed')}
              </label>
              <Select value={state ?? null} onValueChange={(next) => { if (next != null) (setState)(next); }} items={[
                  { value: 'open', label: t('github.state_open') },
                  { value: 'closed', label: t('github.state_closed') },
                ]}><SelectTrigger className="w-full" aria-label={`${t('github.state_open')} / ${t('github.state_closed')}`}><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{([
                  { value: 'open', label: t('github.state_open') },
                  { value: 'closed', label: t('github.state_closed') },
                ]).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1 text-muted-foreground"
            >
              <HugeiconsIcon icon={UserAdd01Icon} size={11} />
              {t('github.assignees')}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {assignees.map((login) => {
                const u = mentionables.find((m) => m.login === login);
                return (
                  <AssigneeAvatar
                    key={login}
                    login={login}
                    avatarUrl={u?.avatar_url ?? null}
                    onRemove={() => handleRemoveAssignee(login)}
                  />
                );
              })}
              <Popover open={assigneePickerOpen} onOpenChange={(open) => { setAssigneePickerOpen(open); if (!open) setAssigneePickerQuery(''); }}>
                <PopoverTrigger render={<Button type="button" variant="outline" size="xs" className="shrink-0 rounded-full border-dashed" onClick={openAssigneePicker} />}>
                  <HugeiconsIcon icon={AtSignIcon} size={12} />
                  {t('github.add_assignee')}
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 gap-0 p-1.5">
                  <Command shouldFilter={false} className="rounded-none p-0">
                  <Input
                    ref={assigneePickerRef}
                    type="text"
                    value={assigneePickerQuery}
                    onChange={(e) => setAssigneePickerQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setAssigneePickerOpen(false);
                        setAssigneePickerQuery('');
                      }
                    }}
                    placeholder={t('github.add_assignee_hint')}
                    aria-label={t('github.add_assignee')}
                    className="w-full rounded-md px-2 py-1 text-xs outline-none"
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      height: 28,
                    }}
                  />
                  {assigneeSuggestions.length > 0 && (
                    <ul className="mt-1 max-h-48 overflow-auto rounded-md py-1">
                      {assigneeSuggestions.map((u) => (
                        <li key={u.login}>
                          <Button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAssignees((prev) => [...prev, u.login]);
                              setAssigneePickerQuery('');
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                            style={{ color: 'var(--foreground)' }}
                          >
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="size-5 rounded-full shrink-0" />
                            ) : (
                              <span
                                className="size-5 rounded-full inline-flex items-center justify-center text-[10px] font-semibold shrink-0"
                                style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}
                              >
                                {u.login.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span className="truncate">@{u.login}</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {t('github.minimal_quick_body_label')}
            </span>
            <MentionTextarea
              value={body}
              onChange={setBody}
              users={mentionables}
              featuredLogins={featuredLogins}
              rows={10}
              placeholder={t('github.minimal_quick_body_placeholder')}
              className="text-sm rounded-md px-2 py-1.5 outline-none resize-y font-mono w-full"
              style={{
                background: 'var(--background)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                minHeight: 160,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
          {/* Header: title + status + open button */}
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold leading-tight text-foreground">
              {initial.title}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: initial.state === 'open'
                    ? 'color-mix(in srgb, var(--success) 14%, transparent)'
                    : 'var(--accent)',
                  color: initial.state === 'open' ? 'var(--success)' : 'var(--muted-foreground)',
                  border: '1px solid color-mix(in srgb, var(--success) 28%, transparent)',
                }}
              >
                {initial.state === 'open' ? <HugeiconsIcon icon={CircleDotIcon} size={11} /> : <HugeiconsIcon icon={CheckmarkCircle02Icon} size={11} />}
                {stateLabel}
              </span>
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--accent)',
                  color: 'var(--muted-foreground)',
                  border: '1px solid var(--border)',
                }}
              >
                <HugeiconsIcon icon={HashIcon} size={11} />
                {initial.number}
              </span>
            </div>
          </div>

          {/* Meta grid */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg p-3"
            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-start gap-2 min-w-0">
              <HugeiconsIcon icon={Target02Icon} size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('github.milestone')}
                </span>
                <span className="text-sm truncate" style={{ color: milestone ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                  {milestone ? milestone.title : t('github.no_milestone_label')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <HugeiconsIcon icon={Calendar03Icon} size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('github.calendar_due_date')}
                </span>
                <span className="text-sm truncate" style={{ color: initial.due_date ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                  {initial.due_date
                    ? t('github.due_on', { date: new Date(initial.due_date).toLocaleDateString() })
                    : t('github.no_due_date')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0 sm:col-span-2">
              <HugeiconsIcon icon={AtSignIcon} size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
              <div className="flex flex-col min-w-0 gap-1">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('github.assignees')}
                </span>
                {initialAssignees.length > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {initialAssignees.map((login) => {
                      const u = mentionables.find((m) => m.login === login);
                      return <AssigneeAvatar key={login} login={login} avatarUrl={u?.avatar_url ?? null} />;
                    })}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t('github.no_assignees')}
                  </span>
                )}
              </div>
            </div>

            {labels.length > 0 && (
              <div className="flex items-start gap-2 min-w-0 sm:col-span-2">
                <HugeiconsIcon icon={UserIcon} size={13} className="shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
                <div className="flex flex-col min-w-0 gap-1">
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('github.labels')}
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {labels.map((l) => (
                      <span
                        key={l}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
                          color: 'var(--primary)',
                          border: '1px solid color-mix(in srgb, var(--primary) 24%, transparent)',
                        }}
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Body */}
          {body.trim() ? (
            <GithubMarkdownBody content={body} className="text-sm" />
          ) : (
            <p className="text-sm italic text-muted-foreground">{t('github.no_description')}</p>
          )}

          {/* Tabs: Comments / Activity */}
          <Tabs value={tab} onValueChange={(value) => setTab(value as 'comments' | 'timeline')} className="flex flex-col gap-4 border-t border-border pt-4 mt-2">
            <TabsList aria-label="Issue activity" variant="line">
              <TabsTrigger value="comments">
                <HugeiconsIcon icon={Comment01Icon} size={13} />
                {t('github.tab_comments')}
                {comments.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{
                      background: tab === 'comments' ? 'var(--accent)' : 'var(--background)',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {comments.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline">
                <HugeiconsIcon icon={Activity01Icon} size={13} />
                {t('github.tab_timeline')}
                {timeline.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{
                      background: tab === 'timeline' ? 'var(--accent)' : 'var(--background)',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {timeline.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="flex flex-col gap-3">
                {commentsLoading ? (
                  <p className="text-sm italic px-1 text-muted-foreground">{t('github.loading_comments')}</p>
                ) : commentsError && comments.length === 0 ? (
                  <p className="text-sm px-1 text-destructive">{commentsError}</p>
                ) : comments.length === 0 ? (
                  <p className="text-sm italic px-1 text-muted-foreground">{t('github.no_comments_yet')}</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {comments.map((c) => (
                      <IssueCommentCard key={c.id} comment={c} />
                    ))}
                  </div>
                )}

                {commentsError && comments.length > 0 ? (
                  <p className="text-xs px-1 text-destructive">{commentsError}</p>
                ) : null}

                <label className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-medium px-1 text-muted-foreground">{t('github.new_comment')}</span>
                  <MentionTextarea
                    value={newComment}
                    onChange={setNewComment}
                    users={mentionables}
                    featuredLogins={featuredLogins}
                    rows={4}
                    placeholder={t('github.comment_placeholder')}
                    className="text-sm rounded px-2 py-1.5 outline-none resize-none w-full"
                    style={{ background: 'var(--background)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                  />
                </label>
            </TabsContent>
            <TabsContent value="timeline"><IssueTimeline events={timeline} /></TabsContent>
          </Tabs>
        </div>
      )}
    </div><SheetFooter className="border-t px-4 py-3">{footer}</SheetFooter></SheetContent></Sheet>
  );
}
