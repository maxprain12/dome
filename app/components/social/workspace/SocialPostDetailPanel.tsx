import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BubbleChatIcon,
  Copy01Icon,
  Edit02Icon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  RefreshIcon,
  SentIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { HubDetailPane } from '@/components/shared/HubDetailPane';
import type { SocialComment, SocialMetric, SocialPost } from '@/components/social/socialTypes';
import {
  ActionIcon,
  PROVIDER_LABELS,
  ProviderMark,
  ReadField,
  SectionCard,
  formatSocialBody,
  postStatusBadgeVariant,
} from '@/components/social/crm/socialCrmChrome';
import { formatSocialWhen, socialPostLabel } from '@/lib/social/socialQueues';
import { useManyStore } from '@/lib/store/useManyStore';
import { toast } from 'sonner';

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
  onEdit,
  onPublish,
  onPostUpdated,
}: {
  post: SocialPost;
  onEdit: () => void;
  onPublish: () => void;
  onPostUpdated: (post: SocialPost) => void;
}) {
  const { t, i18n } = useTranslation();
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
  const unavailable = t('people.action_unavailable');
  const canPublish = post.status === 'draft' || post.status === 'failed';
  const when = formatSocialWhen(
    post.publishedAt ?? post.scheduledAt ?? post.updatedAt,
    i18n.language,
  );
  const commentsCount = post.metrics?.comments;

  useEffect(() => {
    setNotesDraft(post.notes ?? '');
    setTab('summary');
  }, [post.id, post.notes]);

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
    <HubDetailPane
      icon={<ProviderMark provider={post.provider} className="size-10 text-sm" />}
      title={socialPostLabel(post, 80)}
      badge={
        <Badge variant={postStatusBadgeVariant(post.status)}>
          {t(`social.studio.status.${post.status}`)}
        </Badge>
      }
      subtitle={
        <p className="max-w-full truncate text-xs text-muted-foreground">
          {[PROVIDER_LABELS[post.provider], when, post.campaign || t('social.studio.inspector.organic')]
            .filter(Boolean)
            .join(', ')}
        </p>
      }
      actions={
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
      }
      toolbar={
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('common.edit')}
            available={post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed'}
            unavailableLabel={unavailable}
            icon={Edit02Icon}
            onClick={onEdit}
          />
          <ActionIcon
            label={canPublish ? t('social.hub.publish_now') : t('social.hub.open_post')}
            available={canPublish || Boolean(post.externalUrl)}
            unavailableLabel={unavailable}
            icon={canPublish ? SentIcon : ExternalLinkIcon}
            onClick={() => {
              if (canPublish) onPublish();
              else if (post.externalUrl) window.open(post.externalUrl, '_blank', 'noreferrer');
            }}
          />
          <ActionIcon
            label={t('social.agent_ask_many')}
            available
            unavailableLabel={unavailable}
            icon={BubbleChatIcon}
            onClick={handleMany}
          />
        </div>
      }
    >

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (isPostTab(value)) setTab(value);
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3">
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
            <div className="flex flex-col gap-4 p-3">
              <SectionCard title={t('social.studio.composer.copy')}>
                <p className="whitespace-pre-wrap text-xs leading-5">
                  {formatSocialBody(post.body) || t('social.hub.no_text')}
                </p>
              </SectionCard>
              <SectionCard title={t('social.metrics.title')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ReadField
                    label={t('social.metrics.impressions')}
                    value={post.metrics?.impressions != null ? Intl.NumberFormat().format(post.metrics.impressions) : ''}
                  />
                  <ReadField
                    label={t('social.metrics.likes')}
                    value={post.metrics?.likes != null ? Intl.NumberFormat().format(post.metrics.likes) : ''}
                  />
                  <ReadField
                    label={t('social.metrics.comments')}
                    value={post.metrics?.comments != null ? Intl.NumberFormat().format(post.metrics.comments) : ''}
                  />
                  <ReadField
                    label={t('social.metrics.shares')}
                    value={post.metrics?.shares != null ? Intl.NumberFormat().format(post.metrics.shares) : ''}
                  />
                </div>
              </SectionCard>
              {post.error ? (
                <Alert variant="destructive">
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
          <div className="flex h-full flex-col gap-3 p-3">
            <Field className="min-h-0 flex-1">
              <FieldLabel htmlFor={`social-post-notes-${post.id}`}>
                {t('social.studio.inspector.notes_label')}
              </FieldLabel>
              <Textarea
                id={`social-post-notes-${post.id}`}
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                placeholder={t('social.studio.inspector.notes_placeholder')}
                className="min-h-0 flex-1 resize-none"
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
    </HubDetailPane>
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
      <ul className="flex flex-col p-3">
        {comments.map((comment) => (
          <li key={comment.id} className="border-b border-border/80 py-2.5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs font-semibold">{commentAuthorLabel(comment, anonymous)}</p>
              {comment.createdAt ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatSocialWhen(comment.createdAt, language)}
                </span>
              ) : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{comment.text || '—'}</p>
          </li>
        ))}
      </ul>
    </ScrollArea>
  );
}
