import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BubbleChatIcon,
  Cancel01Icon,
  Copy01Icon,
  Edit02Icon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  SentIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldLabel } from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import ListState from '@/components/shared/ListState';
import type { SocialAccount, SocialComment, SocialMetric, SocialPost } from '@/components/social/socialTypes';
import {
  PROVIDER_LABELS,
  ProviderMark,
  postStatusBadgeVariant,
} from '@/components/social/crm/socialCrmChrome';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
import { useManyStore } from '@/lib/store/useManyStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDetailModalClose } from '@/components/shared/DetailModal';

import { SocialPostAuthor, SocialPostMedia, SocialPostPreview, socialWebUrl } from './SocialPostPreview';

type PostTab = 'summary' | 'comments' | 'notes';

type CommentsListPayload = {
  comments?: SocialComment[];
  unsupported?: boolean;
  reason?: string;
  error?: string;
};

function isPostTab(value: string): value is PostTab {
  return value === 'summary' || value === 'comments' || value === 'notes';
}

function commentsUnsupportedTitleKey(reason: string | null): string {
  if (reason === 'permission') return 'social.studio.inspector.comments_permission_title';
  if (reason === 'no_account') return 'social.studio.inspector.comments_no_account_title';
  return 'social.studio.inspector.comments_unsupported_title';
}

function commentsUnsupportedDescription(
  reason: string | null,
  opts: {
    t: (key: string, options?: Record<string, unknown>) => string;
    commentsCount: number | null | undefined;
    providerLabel: string;
    commentsError: string | null;
  },
): string {
  if (reason === 'permission') {
    return opts.t('social.studio.inspector.comments_permission', {
      count: opts.commentsCount ?? 0,
      provider: opts.providerLabel,
    });
  }
  if (reason === 'no_account') {
    return opts.t('social.studio.inspector.comments_no_account');
  }
  return opts.commentsError || opts.t('social.studio.inspector.comments_unsupported');
}

function commentAuthorLabel(comment: SocialComment, anonymousLabel: string): string {
  return comment.authorName || comment.authorExternalId || anonymousLabel;
}

function usePostComments(post: SocialPost, tab: PostTab, errorFallback: string) {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [commentsUnsupported, setCommentsUnsupported] = useState(false);
  const [commentsReason, setCommentsReason] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'comments') return;
    if (post.status !== 'published' || !post.externalPostId) {
      setComments([]);
      setCommentsUnsupported(false);
      setCommentsReason(null);
      setCommentsError(null);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    setCommentsError(null);
    setCommentsReason(null);
    (async () => {
      const response = await window.electron.invoke('social:comments:list', { postId: post.id });
      if (cancelled) return;
      setCommentsLoading(false);
      if (!response?.success) {
        setComments([]);
        setCommentsUnsupported(false);
        setCommentsError(response?.error || errorFallback);
        return;
      }
      const data = response.data as CommentsListPayload;
      setComments(Array.isArray(data?.comments) ? data.comments : []);
      setCommentsUnsupported(Boolean(data?.unsupported));
      setCommentsReason(data?.reason ?? null);
      if (data?.unsupported && data.reason === 'error' && data.error) {
        setCommentsError(data.error);
      }
    })().catch((reason: unknown) => {
      if (cancelled) return;
      setCommentsLoading(false);
      setCommentsError(reason instanceof Error ? reason.message : errorFallback);
    });
    return () => {
      cancelled = true;
    };
  }, [errorFallback, post.externalPostId, post.id, post.status, tab]);

  return { comments, commentsLoading, commentsError, commentsUnsupported, commentsReason };
}

async function savePostNotes(opts: {
  post: SocialPost;
  notesDraft: string;
  onPostUpdated: (post: SocialPost) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}): Promise<void> {
  const { post, notesDraft, onPostUpdated, t } = opts;
  const response = await window.electron.invoke('social:posts:updateNotes', {
    postId: post.id,
    notes: notesDraft.trim() || null,
  });
  if (!response?.success) {
    toast.error(response?.error || t('social.studio.inspector.notes_error'));
    return;
  }
  onPostUpdated({
    ...post,
    ...(response.data as SocialPost),
    metrics: post.metrics,
  });
  toast.success(t('social.studio.inspector.notes_saved'));
}

function pinPostInMany(post: SocialPost, snippet: string) {
  const many = useManyStore.getState();
  many.addPinnedResource({
    id: post.id,
    title: socialPostLabel(post),
    type: 'social_post',
    kind: 'social_post',
    meta: {
      provider: post.provider,
      campaign: post.campaign,
      campaignId: post.campaignId,
      status: post.status,
    },
  });
  many.setPendingOneShotSkill('dome-social-growth');
  many.setPendingManyHandoff(snippet);
  many.setOpen(true);
}

export function SocialPostDetailPanel({
  post,
  account,
  onEdit,
  onPublish,
  onPostUpdated,
}: {
  post: SocialPost;
  account?: SocialAccount;
  onEdit: () => void;
  onPublish: () => void;
  onPostUpdated: (post: SocialPost) => void;
}) {
  const { t, i18n } = useTranslation();
  const closeDetail = useDetailModalClose();
  const [tab, setTab] = useState<PostTab>('summary');
  const commentsErrorFallback = t('social.studio.inspector.comments_error');
  const {
    comments,
    commentsLoading,
    commentsError,
    commentsUnsupported,
    commentsReason,
  } = usePostComments(post, tab, commentsErrorFallback);
  const [notesDraft, setNotesDraft] = useState(post.notes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const canPublish = post.status === 'draft' || post.status === 'failed';
  const canEdit = canPublish || post.status === 'scheduled';
  const hasMedia = Boolean(post.media?.length);
  const externalUrl = socialWebUrl(post.externalUrl);
  const commentsCount = post.metrics?.comments;

  useEffect(() => {
    setNotesDraft(post.notes ?? '');
  }, [post.id, post.notes]);

  useEffect(() => { setTab('summary'); }, [post.id]);

  const handleSaveNotes = () => {
    setNotesSaving(true);
    savePostNotes({ post, notesDraft, onPostUpdated, t })
      .catch(() => undefined)
      .finally(() => {
        setNotesSaving(false);
      });
  };

  const handleMany = () => {
    pinPostInMany(post, t('social.agent_prompt_about', { snippet: post.body.slice(0, 120) }));
    closeDetail?.();
  };

  const handleCopyLink = () => {
    if (!post.externalUrl) return;
    navigator.clipboard?.writeText(post.externalUrl).then(
      () => toast.success(t('social.events.copied')),
      () => undefined,
    );
  };

  const handleRefreshMetrics = () => {
    window.electron
      .invoke('social:metrics:refreshPost', { postId: post.id })
      .then((response) => {
        if (response?.success && response.data) {
          onPostUpdated({ ...post, metrics: response.data as SocialMetric });
        }
      })
      .catch(() => undefined);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <SocialPostAuthor post={post} account={account} />
        <div className="hidden items-center gap-2 sm:flex">
          <ProviderMark provider={post.provider} />
        <Badge variant={postStatusBadgeVariant(post.status)}>
          {t(`social.studio.status.${post.status}`)}
        </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" />}
            aria-label={t('people.more_actions')}
            title={t('people.more_actions')}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!post.externalUrl} onClick={handleCopyLink}>
              <HugeiconsIcon icon={Copy01Icon} />
              {t('social.studio.crm.copy_link')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleRefreshMetrics}>
              <HugeiconsIcon icon={RefreshIcon} />
              {t('social.studio.crm.refresh_metrics')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DialogClose render={<Button variant="ghost" size="icon-sm" />} aria-label={t('common.close')}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </DialogClose>
      </header>
      <div className={cn('grid min-h-0 flex-1 grid-cols-1', hasMedia && 'grid-rows-[min(30dvh,16rem)_minmax(0,1fr)] md:grid-cols-[minmax(0,1.35fr)_minmax(22rem,1fr)] md:grid-rows-1')}>
        {hasMedia ? <section aria-label={t('social.native.media')} className="min-h-0 min-w-0 border-b bg-muted/30 md:border-b-0 md:border-r">
          <SocialPostMedia key={post.id} media={post.media} fit />
        </section> : null}
        <div className="flex min-h-0 min-w-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isPostTab(value)) setTab(value);
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList variant="line" className="w-full shrink-0 justify-start rounded-none border-b px-4 py-2 group-data-horizontal/tabs:h-12">
          <TabsTrigger value="summary">{t('social.studio.inspector.tab_summary')}</TabsTrigger>
          <TabsTrigger value="comments">
            {t('social.studio.inspector.tab_comments')}
            {commentsCount != null ? (
              <Badge variant="secondary" className="ml-1">
                {Intl.NumberFormat().format(commentsCount)}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="notes">{t('social.studio.inspector.tab_notes')}</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-5">
              <SocialPostPreview key={post.id} post={post} detail />
              <section className="mx-5 border-t py-5">
                <h3 className="mb-4 text-xs font-medium text-muted-foreground">{t('social.metrics.title')}</h3>
                <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
                  {(['impressions', 'likes', 'comments', 'shares', 'saves', 'clicks'] as const).map((metric) => (
                    <div key={metric}>
                      <dt className="text-xs text-muted-foreground">{t(`social.metrics.${metric}`)}</dt>
                      <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{post.metrics?.[metric] != null ? Intl.NumberFormat(i18n.language).format(post.metrics[metric]) : '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <div className="mx-5 flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
                <span>{PROVIDER_LABELS[post.provider]}</span><span aria-hidden="true">·</span>
                <span>{post.campaign || t('social.studio.inspector.organic')}</span>
                {post.source?.format ? <Badge variant="outline">{t(`social.native.format_${post.source.format}`, { defaultValue: post.source.format })}</Badge> : null}
                <Badge variant={postStatusBadgeVariant(post.status)} className="sm:hidden">{t(`social.studio.status.${post.status}`)}</Badge>
              </div>
              {post.error ? (
                <Alert variant="destructive" className="mx-5 mt-4 w-auto">
                  <AlertDescription>{post.error}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="comments" className="min-h-0 flex-1 overflow-hidden">
          <CommentsPane
            post={post}
            comments={comments}
            commentsLoading={commentsLoading}
            commentsError={commentsError}
            commentsUnsupported={commentsUnsupported}
            commentsReason={commentsReason}
            language={i18n.language}
          />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
            <Field className="min-h-0 flex-1">
              <FieldLabel htmlFor={`social-post-notes-${post.id}`}>
                {t('social.studio.inspector.notes_label')}
              </FieldLabel>
              <Textarea
                id={`social-post-notes-${post.id}`}
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder={t('social.studio.inspector.notes_placeholder')}
                className="min-h-24 flex-1 resize-none"
              />
              <p className="text-xs text-muted-foreground">{t('social.studio.inspector.notes_hint')}</p>
            </Field>
            <Button
              type="button"
              className="self-end"
              disabled={notesSaving || notesDraft === (post.notes ?? '')}
              onClick={handleSaveNotes}
            >
              {notesSaving ? <Spinner data-icon="inline-start" /> : null}
              {t('social.studio.inspector.notes_save')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={handleMany}><HugeiconsIcon icon={BubbleChatIcon} />{t('social.agent_ask_many')}</Button>
            <div className="ml-auto flex items-center gap-2">
              {canEdit ? <Button variant="ghost" size="icon-sm" aria-label={t('common.edit')} title={t('common.edit')} onClick={onEdit}><HugeiconsIcon icon={Edit02Icon} /></Button> : null}
              {canPublish ? <Button size="sm" onClick={onPublish}><HugeiconsIcon icon={SentIcon} />{t('social.hub.publish_now')}</Button> : null}
              {!canPublish && externalUrl ? <Button nativeButton={false} variant="outline" size="sm" render={<a href={externalUrl} target="_blank" rel="noreferrer" aria-label={t('social.hub.open_post')} />}><HugeiconsIcon icon={ExternalLinkIcon} />{t('social.hub.open_post')}</Button> : null}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function CommentsPane({
  post,
  comments,
  commentsLoading,
  commentsError,
  commentsUnsupported,
  commentsReason,
  language,
}: {
  post: SocialPost;
  comments: SocialComment[];
  commentsLoading: boolean;
  commentsError: string | null;
  commentsUnsupported: boolean;
  commentsReason: string | null;
  language: string;
}) {
  const { t } = useTranslation();
  const unpublished = post.status !== 'published' || !post.externalPostId;
  if (unpublished) {
    return (
      <ListState
        variant="empty"
        title={t('social.studio.inspector.comments_unpublished_title')}
        description={t('social.studio.inspector.comments_unpublished')}
        compact
      />
    );
  }
  if (commentsLoading) {
    return <ListState variant="loading" loadingLabel={t('social.studio.inspector.comments_loading')} compact />;
  }
  if (commentsError && !commentsUnsupported) {
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <AlertDescription>{commentsError}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (commentsUnsupported) {
    return (
      <ListState
        variant="empty"
        title={t(commentsUnsupportedTitleKey(commentsReason))}
        description={commentsUnsupportedDescription(commentsReason, {
          t,
          commentsCount: post.metrics?.comments,
          providerLabel: PROVIDER_LABELS[post.provider],
          commentsError,
        })}
        compact
      />
    );
  }
  if (comments.length === 0) {
    return (
      <ListState
        variant="empty"
        title={t('social.studio.inspector.comments_empty_title')}
        description={t('social.studio.inspector.comments_empty')}
        compact
      />
    );
  }
  const anonymous = t('social.studio.inspector.comments_anonymous');
  return (
    <ScrollArea className="h-full">
      <ul className="flex flex-col px-5 py-2">
        {comments.map((comment) => (
          <li key={comment.id} className="flex gap-3 border-b border-border/60 py-4 last:border-b-0">
            <Avatar><AvatarFallback>{commentAuthorLabel(comment, anonymous).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold">{commentAuthorLabel(comment, anonymous)}</p>
              {comment.createdAt ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatSocialWhen(comment.createdAt, language)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{comment.text || '—'}</p>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
