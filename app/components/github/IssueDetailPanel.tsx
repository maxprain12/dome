import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, MessageSquare, Save, Pencil, Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';
import { githubClient, parseLabels } from '@/lib/github/client';
import { useGitHubStore } from '@/lib/store/useGitHubStore';

function formatCommentDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
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

/**
 * Issue detail as a modal. The body is rendered as Markdown by default and
 * switches to a raw editor in edit mode. Saving pushes to GitHub.
 */
export default function IssueDetailPanel({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const issues = useGitHubStore((s) => s.issues);
  const syncNow = useGitHubStore((s) => s.syncNow);
  const initial = issues.find((i) => i.id === issueId);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [state, setState] = useState<'open' | 'closed'>(initial?.state ?? 'open');
  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState<GitHubIssueCommentRow[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

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

  useEffect(() => {
    if (initial) {
      setTitle(initial.title);
      setBody(initial.body ?? '');
      setState(initial.state);
      setEditing(false);
      setNewComment('');
    }
  }, [issueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editing) void loadComments();
  }, [issueId, editing, loadComments]);

  if (!initial) return null;

  const save = async () => {
    setSaving(true);
    await githubClient.issues.update(issueId, { title, body, state });
    await syncNow();
    setSaving(false);
    onClose();
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

  const labels = parseLabels(initial.labels);
  const stateLabel = initial.state === 'open' ? t('github.state_open') : t('github.state_closed');

  const headerActions = initial.html_url ? (
    <a href={initial.html_url} target="_blank" rel="noreferrer" title={t('github.open_on_github')} style={{ color: 'var(--dome-text-muted)' }}>
      <ExternalLink size={16} />
    </a>
  ) : null;

  const footer = editing ? (
    <div className="flex items-center justify-end gap-2 w-full">
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm"
        style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text-muted)' }}
      >
        <X size={15} /> {t('github.cancel')}
      </button>
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
        style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent)', opacity: saving ? 0.6 : 1 }}
      >
        <Save size={15} /> {saving ? t('github.saving') : t('github.save_sync')}
      </button>
    </div>
  ) : (
    <div className="flex items-center justify-end gap-2 w-full">
      <button
        type="button"
        onClick={() => void postComment()}
        disabled={postingComment || !newComment.trim()}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium"
        style={{
          background: 'var(--dome-accent)',
          color: 'var(--dome-on-accent)',
          opacity: postingComment || !newComment.trim() ? 0.6 : 1,
        }}
      >
        <Send size={15} /> {postingComment ? t('github.posting_comment') : t('github.post_comment')}
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium"
        style={{ border: '1px solid var(--dome-border)', color: 'var(--dome-text)' }}
      >
        <Pencil size={15} /> {t('github.edit')}
      </button>
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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-base font-semibold rounded px-2 py-1.5"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
          />
          <select
            value={state}
            onChange={(e) => setState(e.target.value as 'open' | 'closed')}
            className="text-sm rounded px-2 py-1 w-32"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
          >
            <option value="open">{t('github.state_open')}</option>
            <option value="closed">{t('github.state_closed')}</option>
          </select>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="text-sm rounded px-2 py-1.5 resize-none font-mono"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-[min(70vh,720px)] overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>{initial.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: initial.state === 'open' ? 'var(--success-bg)' : 'var(--dome-bg-hover)',
                  color: initial.state === 'open' ? 'var(--success)' : 'var(--dome-text-muted)',
                }}
              >
                {stateLabel}
              </span>
              {initial.due_date && (
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('github.due_on', { date: new Date(initial.due_date).toLocaleDateString() })}
                </span>
              )}
              {labels.map((l) => (
                <span key={l} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}>{l}</span>
              ))}
            </div>
            {body.trim() ? (
              <GithubMarkdownBody content={body} className="text-sm" />
            ) : (
              <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_description')}</p>
            )}
          </div>

          <section className="flex flex-col gap-3 pt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
            <div className="flex items-center gap-2">
              <MessageSquare size={16} style={{ color: 'var(--dome-text-muted)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                {comments.length > 0
                  ? t('github.comments_with_count', { count: comments.length })
                  : t('github.comments')}
              </h3>
            </div>

            {commentsLoading ? (
              <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>{t('github.loading_comments')}</p>
            ) : commentsError && comments.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--error)' }}>{commentsError}</p>
            ) : comments.length === 0 ? (
              <p className="text-sm italic" style={{ color: 'var(--dome-text-muted)' }}>{t('github.no_comments_yet')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {comments.map((c) => (
                  <IssueCommentCard key={c.id} comment={c} />
                ))}
              </div>
            )}

            {commentsError && comments.length > 0 ? (
              <p className="text-xs" style={{ color: 'var(--error)' }}>{commentsError}</p>
            ) : null}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: 'var(--dome-text-muted)' }}>{t('github.new_comment')}</span>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={4}
                placeholder={t('github.comment_placeholder')}
                className="text-sm rounded px-2 py-1.5 resize-none"
                style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)', border: '1px solid var(--dome-border)' }}
              />
            </label>
          </section>
        </div>
      )}
    </DomeModal>
  );
}
