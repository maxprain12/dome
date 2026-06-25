import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ExternalLink, MessageSquare, Save, Pencil, Send, X,
  CircleDot, CheckCircle2, Calendar, Target, Milestone,
  AtSign, Hash, UserPlus, User, Activity,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import IssueTimeline from '@/components/github/IssueTimeline';
import MentionTextarea, { type Mentionable } from '@/components/github/MentionTextarea';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

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
      style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {comment.user_avatar ? (
            <img
              src={comment.user_avatar}
              alt=""
              className="size-6 rounded-full shrink-0"
              style={{ border: '1px solid var(--dome-border)' }}
            />
          ) : null}
          <span className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
            {comment.user || t('github.anonymous_user')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {comment.created_at ? (
            <time className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }} dateTime={new Date(comment.created_at).toISOString()}>
              {formatCommentDate(comment.created_at)}
            </time>
          ) : null}
          {comment.html_url ? (
            <a href={comment.html_url} target="_blank" rel="noreferrer" title={t('github.open_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
              <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </div>
      {comment.body.trim() ? (
        <GithubMarkdownBody content={comment.body} className="text-sm" />
      ) : (
        <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>{t('github.empty_comment')}</p>
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
        background: 'var(--dome-bg-hover)',
        border: '1px solid var(--dome-border)',
        height: size + 6,
        color: 'var(--dome-text)',
      }}
      title={onRemove ? `@${login}` : undefined}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="rounded-full shrink-0"
          style={{ width: size, height: size, border: '1px solid var(--dome-border)' }}
        />
      ) : (
        <span
          className="rounded-full inline-flex items-center justify-center font-semibold shrink-0"
          style={{
            width: size,
            height: size,
            background: 'var(--dome-bg)',
            color: 'var(--dome-text-muted)',
            fontSize: size * 0.45,
          }}
        >
          {login.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="text-xs font-medium truncate max-w-[120px]">{login}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`@${login}`}
          className="shrink-0 inline-flex items-center justify-center rounded-full"
          style={{
            width: 14,
            height: 14,
            background: 'transparent',
            border: 'none',
            color: 'var(--dome-text-muted)',
            cursor: 'pointer',
          }}
        >
          <X size={10} />
        </button>
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
  const syncNow = useGitHubStore((s) => s.syncNow);
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
  const [mentionables, setMentionables] = useState<Mentionable[]>([]);
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

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setBody(initial.body ?? '');
      setState(initial.state);
      setMilestoneChoice(initial.milestone_number != null ? String(initial.milestone_number) : 'none');
      setAssignees(parseAssignees(initial.assignees));
      setEditing(false);
      setNewComment('');
      setAssigneePickerOpen(false);
      setAssigneePickerQuery('');
      setTab('comments');
    }
  }, [issueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) {
      void loadComments();
      void loadTimeline();
    }
  }, [issueId, editing, loadComments, loadTimeline]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await githubClient.issues.listMentionables(issueId);
      if (cancelled) return;
      const byLogin = new Map<string, Mentionable>();
      for (const u of res.success ? res.users ?? [] : []) {
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
      setMentionables([...byLogin.values()].sort((a, b) => a.login.localeCompare(b.login)));
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId, comments, timeline]);

  useEffect(() => {
    if (assigneePickerOpen) {
      requestAnimationFrame(() => assigneePickerRef.current?.focus());
    }
  }, [assigneePickerOpen]);

  const featuredLogins = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignees) set.add(a.toLowerCase());
    for (const c of comments) if (c.user) set.add(c.user.toLowerCase());
    for (const ev of timeline) if (ev.actor) set.add(ev.actor.toLowerCase());
    return [...set];
  }, [assignees, comments, timeline]);

  const assigneeSuggestions = useMemo(() => {
    const q = assigneePickerQuery.trim().toLowerCase();
    return mentionables
      .filter((u) => !assignees.includes(u.login))
      .filter((u) => !q || u.login.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mentionables, assignees, assigneePickerQuery]);

  if (!initial) return null;

  const labels = parseLabels(initial.labels);
  const stateLabel = initial.state === 'open' ? t('github.state_open') : t('github.state_closed');
  const milestone = initial.milestone_number != null
    ? milestones.find((m) => m.number === initial.milestone_number)
    : null;
  const initialAssignees = parseAssignees(initial.assignees);

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
    await syncNow();
    setSaving(false);
    setEditing(false);
  };

  const toggleState = async () => {
    await githubClient.issues.move(issueId, { state: initial.state === 'open' ? 'closed' : 'open' });
    void syncNow();
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
        <DomeButton
          iconOnly
          variant="ghost"
          size="sm"
          aria-label={t('github.open_on_github')}
          onClick={() => window.open(initial.html_url!, '_blank', 'noreferrer')}
        >
          <ExternalLink size={14} />
        </DomeButton>
      )}
      <DomeButton
        variant="outline"
        size="sm"
        onClick={toggleState}
        leftIcon={initial.state === 'open' ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
      >
        {initial.state === 'open' ? t('github.close') : t('github.reopen')}
      </DomeButton>
      {!editing && (
        <DomeButton
          variant="primary"
          size="sm"
          leftIcon={<Pencil size={13} />}
          onClick={() => setEditing(true)}
        >
          {t('github.edit')}
        </DomeButton>
      )}
    </div>
  );

  const footer = editing ? (
    <div className="flex items-center justify-end gap-2 w-full">
      <DomeButton variant="outline" size="sm" onClick={() => setEditing(false)} leftIcon={<X size={13} />}>
        {t('github.cancel')}
      </DomeButton>
      <DomeButton
        variant="primary"
        size="sm"
        loading={saving}
        onClick={() => void save()}
        leftIcon={<Save size={13} />}
      >
        {t('github.save_sync')}
      </DomeButton>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-2 w-full">
      <DomeButton
        variant="primary"
        size="sm"
        loading={postingComment}
        disabled={!newComment.trim()}
        onClick={() => void postComment()}
        leftIcon={<Send size={13} />}
      >
        {t('github.post_comment')}
      </DomeButton>
    </div>
  );

  return (
    <DomeModal
      open
      onClose={onClose}
      size="lg"
      title={t('github.issue_title', { number: initial.number })}
      headerActions={headerActions}
      footer={footer}
    >
      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="issue-edit-title"
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              {t('github.minimal_quick_title_label')}
            </label>
            <input
              id="issue-edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-semibold rounded-md px-2.5 py-1.5 outline-none"
              style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
            />
          </div>

          <div className="flex flex-wrap items-start gap-3">
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <label
                htmlFor="issue-edit-milestone"
                className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                <Milestone size={11} />
                {t('github.milestone')}
              </label>
              <DomeSelectMenu
                value={milestoneChoice}
                onChange={setMilestoneChoice}
                aria-label={t('github.milestone')}
                options={[
                  { value: 'none', label: t('github.no_milestone_label') },
                  ...milestones.filter((m) => m.state === 'open').map((m) => ({ value: String(m.number), label: m.title })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <label
                htmlFor="issue-edit-state"
                className="text-[11px] font-medium uppercase tracking-wide"
                style={{ color: 'var(--dome-text-muted)' }}
              >
                {t('github.state_open')} / {t('github.state_closed')}
              </label>
              <DomeSelectMenu<'open' | 'closed'>
                value={state}
                onChange={setState}
                aria-label={`${t('github.state_open')} / ${t('github.state_closed')}`}
                options={[
                  { value: 'open', label: t('github.state_open') },
                  { value: 'closed', label: t('github.state_closed') },
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              className="text-[11px] font-medium uppercase tracking-wide inline-flex items-center gap-1"
              style={{ color: 'var(--dome-text-muted)' }}
            >
              <UserPlus size={11} />
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
                    onRemove={() => setAssignees((prev) => prev.filter((a) => a !== login))}
                  />
                );
              })}
              {!assigneePickerOpen ? (
                <button
                  type="button"
                  onClick={() => setAssigneePickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 shrink-0"
                  style={{
                    height: 28,
                    background: 'transparent',
                    border: '1px dashed var(--dome-border)',
                    color: 'var(--dome-text-muted)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  <AtSign size={12} />
                  {t('github.add_assignee')}
                </button>
              ) : (
                <div className="relative flex-1 min-w-[180px]">
                  <input
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
                    onBlur={() => {
                      setTimeout(() => {
                        setAssigneePickerOpen(false);
                        setAssigneePickerQuery('');
                      }, 120);
                    }}
                    placeholder={t('github.add_assignee_hint')}
                    aria-label={t('github.add_assignee')}
                    className="w-full rounded-md px-2 py-1 text-xs outline-none"
                    style={{
                      background: 'var(--dome-bg)',
                      border: '1px solid var(--dome-border)',
                      color: 'var(--dome-text)',
                      height: 28,
                    }}
                  />
                  {assigneeSuggestions.length > 0 && (
                    <ul
                      className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-md py-1 shadow-lg"
                      style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
                    >
                      {assigneeSuggestions.map((u) => (
                        <li key={u.login}>
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAssignees((prev) => [...prev, u.login]);
                              setAssigneePickerQuery('');
                            }}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                            style={{ color: 'var(--dome-text)' }}
                          >
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="size-5 rounded-full shrink-0" />
                            ) : (
                              <span
                                className="size-5 rounded-full inline-flex items-center justify-center text-[10px] font-semibold shrink-0"
                                style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
                              >
                                {u.login.slice(0, 1).toUpperCase()}
                              </span>
                            )}
                            <span className="truncate">@{u.login}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--dome-text-muted)' }}
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
                background: 'var(--dome-bg)',
                color: 'var(--dome-text)',
                border: '1px solid var(--dome-border)',
                minHeight: 160,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
          {/* Header: title + status + open button */}
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold leading-tight" style={{ color: 'var(--dome-text)' }}>
              {initial.title}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: initial.state === 'open'
                    ? 'color-mix(in srgb, var(--success) 14%, transparent)'
                    : 'var(--dome-bg-hover)',
                  color: initial.state === 'open' ? 'var(--success)' : 'var(--dome-text-muted)',
                  border: '1px solid color-mix(in srgb, var(--success) 28%, transparent)',
                }}
              >
                {initial.state === 'open' ? <CircleDot size={11} /> : <CheckCircle2 size={11} />}
                {stateLabel}
              </span>
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--dome-bg-hover)',
                  color: 'var(--dome-text-muted)',
                  border: '1px solid var(--dome-border)',
                }}
              >
                <Hash size={11} />
                {initial.number}
              </span>
            </div>
          </div>

          {/* Meta grid */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg p-3"
            style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}
          >
            <div className="flex items-start gap-2 min-w-0">
              <Target size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('github.milestone')}
                </span>
                <span className="text-sm truncate" style={{ color: milestone ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
                  {milestone ? milestone.title : t('github.no_milestone_label')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <Calendar size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('github.calendar_due_date')}
                </span>
                <span className="text-sm truncate" style={{ color: initial.due_date ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
                  {initial.due_date
                    ? t('github.due_on', { date: new Date(initial.due_date).toLocaleDateString() })
                    : t('github.no_due_date')}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0 sm:col-span-2">
              <AtSign size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} />
              <div className="flex flex-col min-w-0 gap-1">
                <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
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
                  <span className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('github.no_assignees')}
                  </span>
                )}
              </div>
            </div>

            {labels.length > 0 && (
              <div className="flex items-start gap-2 min-w-0 sm:col-span-2">
                <User size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
                <div className="flex flex-col min-w-0 gap-1">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('github.labels')}
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {labels.map((l) => (
                      <span
                        key={l}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'color-mix(in srgb, var(--dome-accent) 12%, transparent)',
                          color: 'var(--dome-accent)',
                          border: '1px solid color-mix(in srgb, var(--dome-accent) 24%, transparent)',
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
            <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_description')}</p>
          )}

          {/* Tabs: Comments / Activity */}
          <section className="flex flex-col gap-4 pt-4 mt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <div
              role="tablist"
              aria-label="Issue activity"
              className="flex items-end gap-4"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'comments'}
                onClick={() => setTab('comments')}
                className="inline-flex items-center gap-1.5 pb-1.5 text-sm font-medium transition-colors"
                style={{
                  color: tab === 'comments' ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === 'comments' ? '2px solid var(--dome-accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                  cursor: 'pointer',
                }}
              >
                <MessageSquare size={13} />
                {t('github.tab_comments')}
                {comments.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{
                      background: tab === 'comments' ? 'var(--dome-bg-hover)' : 'var(--dome-bg)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    {comments.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'timeline'}
                onClick={() => setTab('timeline')}
                className="inline-flex items-center gap-1.5 pb-1.5 text-sm font-medium transition-colors"
                style={{
                  color: tab === 'timeline' ? 'var(--dome-text)' : 'var(--dome-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === 'timeline' ? '2px solid var(--dome-accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                  cursor: 'pointer',
                }}
              >
                <Activity size={13} />
                {t('github.tab_timeline')}
                {timeline.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full ml-0.5"
                    style={{
                      background: tab === 'timeline' ? 'var(--dome-bg-hover)' : 'var(--dome-bg)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    {timeline.length}
                  </span>
                )}
              </button>
            </div>

            {tab === 'comments' ? (
              <div className="flex flex-col gap-3">
                {commentsLoading ? (
                  <p className="text-sm italic px-1" style={{ color: 'var(--dome-text-muted)' }}>{t('github.loading_comments')}</p>
                ) : commentsError && comments.length === 0 ? (
                  <p className="text-sm px-1" style={{ color: 'var(--error)' }}>{commentsError}</p>
                ) : comments.length === 0 ? (
                  <p className="text-sm italic px-1" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_comments_yet')}</p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {comments.map((c) => (
                      <IssueCommentCard key={c.id} comment={c} />
                    ))}
                  </div>
                )}

                {commentsError && comments.length > 0 ? (
                  <p className="text-xs px-1" style={{ color: 'var(--error)' }}>{commentsError}</p>
                ) : null}

                <label className="flex flex-col gap-1.5 pt-1">
                  <span className="text-xs font-medium px-1" style={{ color: 'var(--dome-text-muted)' }}>{t('github.new_comment')}</span>
                  <MentionTextarea
                    value={newComment}
                    onChange={setNewComment}
                    users={mentionables}
                    featuredLogins={featuredLogins}
                    rows={4}
                    placeholder={t('github.comment_placeholder')}
                    className="text-sm rounded px-2 py-1.5 outline-none resize-none w-full"
                    style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
                  />
                </label>
              </div>
            ) : (
              <IssueTimeline events={timeline} />
            )}
          </section>
        </div>
      )}
    </DomeModal>
  );
}
