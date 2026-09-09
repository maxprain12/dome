import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DetailModal } from '@/components/shared/DetailModal';
import ListState from '@/components/shared/ListState';
import type { SocialAccount, SocialPost, SocialProvider } from '../socialTypes';
import { PROVIDER_LABELS } from '../crm/socialCrmChrome';
import { socialPostLabel } from '@/lib/social/socialQueues';
import { SocialPostPreview } from './SocialPostPreview';
import { SocialPostDetailPanel } from './SocialPostDetailPanel';
import { cn } from '@/lib/utils';

export function SocialContentHub({ title, posts, accounts = [], filter, onFilter, filterItems, selectedPost, onSelectPost, onClosePost, onCompose, onPublish, onEditPost, onPostUpdated, query, onQueryChange }: {
  title: string; posts: SocialPost[]; accounts?: SocialAccount[];
  filter: string; onFilter: (filter: string) => void; filterItems: Array<{ value: string; label: string }>;
  selectedPost: SocialPost | null; onSelectPost: (post: SocialPost) => void; onClosePost: () => void;
  onCompose: () => void; onPublish: (post: SocialPost) => void; onEditPost: (post: SocialPost) => void;
  onPostUpdated: (post: SocialPost) => void; query: string; onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState('all');
  const [sort, setSort] = useState('recent');
  const [layout, setLayout] = useState('gallery');
  const visible = useMemo(() => posts.filter((post) => provider === 'all' || post.provider === provider).sort((a, b) => {
    const date = (post: SocialPost) => post.publishedAt ?? post.scheduledAt ?? post.updatedAt;
    return sort === 'oldest' ? date(a) - date(b) : date(b) - date(a);
  }), [posts, provider, sort]);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
      <div><div className="flex items-center gap-2"><h2 className="text-xl font-semibold tracking-tight">{title}</h2><Badge variant="secondary">{visible.length}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{t('social.native.content_description')}</p></div>
      <Button onClick={onCompose}><HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />{t('social.hub.new_post')}</Button>
    </header>
    <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3">
      <Input className="min-w-40 flex-1 basis-48" aria-label={t('social.agent_search')} placeholder={t('social.agent_search')} value={query} onChange={(event) => onQueryChange(event.target.value)} />
      <ContentSelect value={provider} onChange={setProvider} label={t('social.native.network')} options={[{ value: 'all', label: t('social.studio.overview.all_networks') }, ...(['instagram', 'linkedin', 'x'] as SocialProvider[]).map((value) => ({ value, label: PROVIDER_LABELS[value] }))]} />
      <ContentSelect value={filter} onChange={onFilter} label={t('social.studio.crm.filter_by')} options={filterItems} />
      <ContentSelect value={sort} onChange={setSort} label={t('social.native.order')} options={[{ value: 'recent', label: t('social.native.recent') }, { value: 'oldest', label: t('social.native.oldest') }]} />
      <ContentSelect value={layout} onChange={setLayout} label={t('social.native.layout')} options={[{ value: 'gallery', label: t('social.native.gallery') }, { value: 'feed', label: t('social.native.feed') }]} />
    </div>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/20 p-5">
        {!visible.length ? <ListState variant="empty" title={t('social.agent_queue_empty')} description={t('social.studio.content.empty_description')} fullHeight /> : <div className={cn('mx-auto max-w-6xl gap-5', layout === 'gallery' ? 'columns-1 @[58rem]/social-studio:columns-2 @[88rem]/social-studio:columns-3' : 'flex max-w-xl flex-col')}>
          {visible.map((post) => <div className="mb-5 break-inside-avoid" key={post.id}><SocialPostPreview post={post} account={accounts.find((account) => account.id === post.accountId)} compact onInspect={() => onSelectPost(post)} /></div>)}
        </div>}
      </div>
      <DetailModal open={Boolean(selectedPost)} onClose={onClosePost} title={selectedPost ? socialPostLabel(selectedPost) : t('social.native.inspect')} size={selectedPost?.media?.length ? 'wide' : 'compact'} bare dismissOnOutsidePress>
          {selectedPost ? <SocialPostDetailPanel key={selectedPost.id} post={selectedPost} account={accounts.find((account) => account.id === selectedPost.accountId)} onEdit={() => onEditPost(selectedPost)} onPublish={() => onPublish(selectedPost)} onPostUpdated={onPostUpdated} /> : null}
      </DetailModal>
    </div>
  </div>;
}

function ContentSelect({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: Array<{ value: string; label: string }> }) {
  return <Select value={value} onValueChange={(next) => { if (next) onChange(next); }}><SelectTrigger className="w-auto min-w-28" aria-label={label}><SelectValue>{options.find((option) => option.value === value)?.label}</SelectValue></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}
