import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, BubbleChatIcon, SentIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import type { SocialComment, SocialPost } from '@/components/social/socialTypes';
import { formatSocialWhen, looksLikeOpaqueId, socialPostLabel } from '@/lib/social/socialQueues';
import { PersonPeekBody } from '@/components/inspect/PersonPeekBody';
import { openManyWithCombinedContext } from '@/lib/many/openManyCombined';
import { openPersonInHub } from '@/lib/store/useOpenIntentStore';
import { useDetailModalClose } from '@/components/shared/DetailModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MAX_THREAD_INDENT = 4;

function isOpaqueAuthorToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (looksLikeOpaqueId(trimmed)) return true;
  if (/^urn:/i.test(trimmed)) return true;
  return /^\d{8,}$/.test(trimmed);
}

export function commentAuthorLabel(comment: SocialComment, anonymousLabel: string): string {
  const candidates = [comment.personDisplayName, comment.authorName, comment.authorExternalId];
  for (const raw of candidates) {
    const value = (raw || '').trim().replace(/^@/, '');
    if (value && !isOpaqueAuthorToken(value)) return value;
  }
  return anonymousLabel;
}

export function identityExternalId(comment: SocialComment): string | null {
  const handle = comment.authorName?.replace(/^@/, '').trim();
  if (handle && !isOpaqueAuthorToken(handle)) return handle;
  const external = comment.authorExternalId?.trim();
  return external || null;
}

export function patchCommentTree(
  list: SocialComment[],
  commentId: string,
  patch: Partial<SocialComment>,
): SocialComment[] {
  return list.map((item) => {
    if (item.id === commentId) {
      return { ...item, ...patch, replies: patch.replies ?? item.replies };
    }
    if (item.replies?.length) {
      return { ...item, replies: patchCommentTree(item.replies, commentId, patch) };
    }
    return item;
  });
}

export function SocialCommentThread({
  post,
  comment,
  projectId,
  language,
  depth = 0,
  onCommentPatched,
}: {
  post: SocialPost;
  comment: SocialComment;
  projectId: string;
  language: string;
  depth?: number;
  onCommentPatched: (commentId: string, patch: Partial<SocialComment>) => void;
}) {
  const { t } = useTranslation();
  const closeDetail = useDetailModalClose();
  const anonymous = t('social.studio.inspector.comments_anonymous');
  const author = commentAuthorLabel(comment, anonymous);
  const personId = comment.personId || null;
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy] = useState<'reply' | 'contact' | null>(null);
  const [peekPersonId, setPeekPersonId] = useState<string | null>(null);
  const replies = comment.replies ?? [];
  const canAddContact = Boolean(identityExternalId(comment));
  const peeking = Boolean(peekPersonId);

  const togglePeek = () => {
    if (peekPersonId) {
      setPeekPersonId(null);
      return;
    }
    if (personId) setPeekPersonId(personId);
  };

  const contactDisplayName = () => {
    const handle = comment.authorName?.replace(/^@/, '').trim() || '';
    if (handle && !isOpaqueAuthorToken(handle)) return handle;
    if (author !== anonymous) return author;
    return t('social.studio.inspector.comments_anonymous');
  };

  const ensureContact = (): Promise<string | null> => {
    if (personId) return Promise.resolve(personId);
    const externalId = identityExternalId(comment);
    if (!externalId) {
      toast.error(t('social.studio.inspector.comment_no_author'));
      return Promise.resolve(null);
    }
    const displayName = contactDisplayName();
    return window.electron.people
      .upsertIdentity({
        projectId,
        source: post.provider,
        externalId,
        displayName,
        displayLabel: displayName,
      })
      .then(async (response) => {
        if (!response?.success || !response.data) {
          toast.error(response?.error || t('social.studio.inspector.comment_contact_error'));
          return null;
        }
        const person = response.data.person as { id?: string; displayName?: string };
        const nextPersonId = person?.id ?? null;
        if (nextPersonId && comment.authorExternalId && comment.authorExternalId !== externalId) {
          await window.electron.people.linkIdentity({
            personId: nextPersonId,
            projectId,
            source: post.provider,
            externalId: comment.authorExternalId,
            displayLabel: displayName,
          });
        }
        if (nextPersonId) {
          onCommentPatched(comment.id, {
            personId: nextPersonId,
            personDisplayName: person.displayName || displayName,
          });
        }
        return nextPersonId;
      });
  };

  const addContact = () => {
    setBusy('contact');
    ensureContact()
      .then((id) => {
        if (id) {
          setPeekPersonId(id);
          toast.success(t('social.studio.inspector.comment_contact_added'));
        }
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : t('social.studio.inspector.comment_contact_error'));
      })
      .finally(() => {
        setBusy(null);
      });
  };

  const seeMore = () => {
    setBusy('contact');
    ensureContact()
      .then((id) => {
        if (id) openPersonInHub(id, closeDetail);
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : t('social.studio.inspector.comment_contact_error'));
      })
      .finally(() => {
        setBusy(null);
      });
  };

  const askMany = () => {
    const handle = comment.authorName ? `@${comment.authorName.replace(/^@/, '')}` : author;
    openManyWithCombinedContext({
      person: personId
        ? {
            id: personId,
            title: comment.personDisplayName || handle,
            type: 'person',
            kind: 'person',
          }
        : {
            id: `social-author:${identityExternalId(comment) || comment.id}`,
            title: handle,
            type: 'person',
            kind: 'person',
          },
      resource: {
        id: post.id,
        title: socialPostLabel(post),
        type: 'social_post',
        kind: 'social_post',
        meta: { provider: post.provider, status: post.status },
      },
      outcome: 'outreach',
      prompt: t('social.studio.inspector.comment_agent_prompt', {
        handle,
        snippet: (comment.text || '').slice(0, 160),
      }),
    });
    closeDetail?.();
  };

  const sendReply = () => {
    const text = replyText.trim();
    if (!text) return;
    setBusy('reply');
    window.electron
      .invoke('social:comments:reply', { postId: post.id, commentId: comment.id, text })
      .then((response) => {
        if (!response?.success) {
          toast.error(response?.error || t('social.studio.inspector.comment_reply_error'));
          return;
        }
        const data = response.data as { id?: string };
        const nextReply: SocialComment = {
          id: data?.id || `local-${Date.now()}`,
          text,
          authorName: t('social.studio.inspector.comment_you'),
          authorExternalId: null,
          createdAt: Date.now(),
          permalink: null,
          parentId: comment.id,
          replies: [],
        };
        onCommentPatched(comment.id, { replies: [...replies, nextReply] });
        setReplyText('');
        setReplying(false);
        toast.success(t('social.studio.inspector.comment_reply_sent'));
      })
      .catch((reason: unknown) => {
        toast.error(reason instanceof Error ? reason.message : t('social.studio.inspector.comment_reply_error'));
      })
      .finally(() => {
        setBusy(null);
      });
  };

  return (
    <li className={cn('flex gap-3 py-3', depth === 0 && 'border-b border-border/60 last:border-b-0')}>
      <Avatar size={depth > 0 ? 'sm' : 'default'}>
        <AvatarFallback>{author.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-2 truncate text-sm font-semibold">
            <span className="truncate">{author}</span>
            {comment.isOwnAccount ? (
              <Badge variant="outline">{t('social.studio.inspector.comment_you')}</Badge>
            ) : personId ? (
              <Badge variant="lime">{t('social.studio.inspector.comment_is_contact')}</Badge>
            ) : null}
          </p>
          {comment.createdAt ? (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {formatSocialWhen(comment.createdAt, language)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
          {comment.text || '—'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={() => setReplying((open) => !open)}>
            {t('social.studio.inspector.comment_reply')}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={askMany}>
            <HugeiconsIcon icon={BubbleChatIcon} data-icon="inline-start" />
            {t('social.studio.inspector.comment_ask_many')}
          </Button>
          {comment.isOwnAccount ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy === 'contact' || (!personId && !canAddContact)}
              onClick={seeMore}
            >
              {busy === 'contact' ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={UserMultiple02Icon} data-icon="inline-start" />}
              {t('social.studio.inspector.comment_see_more')}
            </Button>
          ) : personId ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={peeking}
              onClick={togglePeek}
            >
              <HugeiconsIcon icon={UserMultiple02Icon} data-icon="inline-start" />
              {t('social.studio.inspector.comment_open_contact')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={busy === 'contact' || !canAddContact}
              onClick={addContact}
            >
              {busy === 'contact' ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />}
              {t('social.studio.inspector.comment_add_contact')}
            </Button>
          )}
        </div>
        {peeking && peekPersonId ? (
          <div className="mt-3 rounded-lg border border-border/70 bg-muted/30 p-3">
            <PersonPeekBody
              personId={peekPersonId}
              openLabel={t('social.studio.inspector.comment_see_more')}
              onOpenInPeople={() => openPersonInHub(peekPersonId, closeDetail)}
            />
          </div>
        ) : null}
        {replying ? (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder={t('social.studio.inspector.comment_reply_placeholder')}
              className="min-h-16 resize-none"
              aria-label={t('social.studio.inspector.comment_reply')}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplying(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" disabled={busy === 'reply' || !replyText.trim()} onClick={sendReply}>
                {busy === 'reply' ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />}
                {t('social.studio.inspector.comment_reply_send')}
              </Button>
            </div>
          </div>
        ) : null}
        {replies.length > 0 ? (
          <ul className={cn('mt-1', depth < MAX_THREAD_INDENT && 'border-l border-border/70 pl-4')}>
            {replies.map((reply) => (
              <SocialCommentThread
                key={reply.id}
                post={post}
                comment={reply}
                projectId={projectId}
                language={language}
                depth={depth + 1}
                onCommentPatched={onCommentPatched}
              />
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
