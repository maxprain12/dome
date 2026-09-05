import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, BubbleChatIcon, UserMultiple02Icon } from '@hugeicons/core-free-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HubMasterDetail } from '@/components/shared/HubMasterDetail';
import { HubPaneState } from '@/components/shared/HubPaneState';
import { SectionCard } from '@/components/shared/SectionCard';
import { focusPerson } from '@/lib/store/useOpenIntentStore';
import { useTabStore } from '@/lib/store/useTabStore';
import type { SocialReplyDraft } from '@/lib/social/socialQueues';
import { useAppStore } from '@/lib/store/useAppStore';

function isPendingDraft(draft: SocialReplyDraft): boolean {
  const status = draft.status || 'draft_only';
  return status === 'draft_only' || status === 'pending' || status === 'queued';
}

export function SocialInboxHub({
  drafts,
  onChanged,
}: {
  drafts: SocialReplyDraft[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? 'default');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useMemo(() => drafts.filter(isPendingDraft), [drafts]);
  const selected = pending.find((draft) => draft.id === selectedId) ?? pending[0] ?? null;

  const run = async (id: string, work: () => Promise<void>) => {
    setBusyId(id);
    try {
      await work();
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const createPerson = (draft: SocialReplyDraft) =>
    run(draft.id, async () => {
      const name = draft.commentAuthor?.trim() || t('social.studio.inbox.unknown_author');
      const res = await window.electron.people.upsert({
        projectId,
        displayName: name,
      });
      const person =
        res.success && res.data?.person && typeof res.data.person === 'object'
          ? (res.data.person as { id?: string })
          : null;
      const personId = person?.id;
      if (personId && draft.commentAuthorExternalId) {
        await window.electron.people.linkIdentity({
          personId,
          source: draft.provider || 'instagram',
          externalId: draft.commentAuthorExternalId,
          displayLabel: name,
        });
      }
      if (personId) {
        useTabStore.getState().openPeopleTab();
        focusPerson({ personId });
      }
    });

  const viewTimeline = (draft: SocialReplyDraft) =>
    run(draft.id, async () => {
      if (!draft.commentAuthorExternalId) return;
      const res = await window.electron.people.search({
        projectId,
        query: draft.commentAuthorExternalId,
      });
      const person = res.success ? res.data?.people?.[0] : undefined;
      if (person?.id) {
        useTabStore.getState().openPeopleTab();
        focusPerson({ personId: person.id });
        return;
      }
      await createPerson(draft);
    });

  const approveReply = (draft: SocialReplyDraft) =>
    run(draft.id, async () => {
      await window.electron.invoke('social:drafts:send', { draftId: draft.id });
    });

  if (pending.length === 0) {
    return (
      <HubPaneState
        variant="empty"
        icon={<HugeiconsIcon icon={BubbleChatIcon} className="size-8" />}
        title={t('social.studio.inbox.empty_title')}
        description={t('social.studio.inbox.empty_description')}
      />
    );
  }

  return (
    <HubMasterDetail className="@container/social-row">
      <div className="flex h-full min-h-0 w-full flex-col border-r md:w-96 md:basis-[36%] md:shrink-0">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 className="text-base font-semibold tracking-tight">{t('social.studio.nav.inbox')}</h2>
          <Badge variant="outline">{pending.length}</Badge>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col p-2">
            {pending.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left hover:bg-muted/70 ${
                    selected?.id === draft.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => setSelectedId(draft.id)}
                >
                  <span className="truncate text-sm font-medium">
                    {draft.commentAuthor || t('social.studio.inbox.unknown_author')}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {draft.commentText || draft.replyBody}
                  </span>
                  {draft.provider ? (
                    <Badge variant="outline">{draft.provider}</Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </div>
      {selected ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
            <SectionCard title={t('social.studio.inbox.comment')}>
              <p className="text-sm">{selected.commentText || '—'}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {selected.commentAuthor || t('social.studio.inbox.unknown_author')}
                {selected.hashtag ? ` · #${selected.hashtag}` : ''}
              </p>
            </SectionCard>
            <SectionCard title={t('social.studio.inbox.draft_reply')}>
              <p className="whitespace-pre-wrap text-sm">{selected.replyBody || '—'}</p>
            </SectionCard>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busyId === selected.id}
                onClick={() => {
                  createPerson(selected).catch(() => undefined);
                }}
              >
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
                {t('social.studio.inbox.create_person')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === selected.id}
                onClick={() => {
                  viewTimeline(selected).catch(() => undefined);
                }}
              >
                <HugeiconsIcon icon={UserMultiple02Icon} data-icon="inline-start" />
                {t('social.studio.inbox.view_timeline')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busyId === selected.id || !selected.commentAuthorExternalId}
                onClick={() => {
                  approveReply(selected).catch(() => undefined);
                }}
              >
                {t('social.studio.inbox.approve_reply')}
              </Button>
            </div>
            {!selected.commentAuthorExternalId ? (
              <p className="text-xs text-muted-foreground">{t('social.studio.inbox.send_needs_author')}</p>
            ) : null}
          </div>
        </ScrollArea>
      ) : null}
    </HubMasterDetail>
  );
}
