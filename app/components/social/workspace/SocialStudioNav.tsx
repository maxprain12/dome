import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  BarChartIcon,
  MagicWand01Icon,
  Bookmark01Icon,
  BubbleChatIcon,
  Calendar03Icon,
  DashboardSquare01Icon,
  File02Icon,
  Megaphone02Icon,
  PlusSignIcon,
  RefreshIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { SocialAccount } from '@/components/social/socialTypes';
import { HubToolbar } from '@/components/hub';
import { socialAccountLabel } from '@/lib/social/socialQueues';
import type { SocialSection } from './socialWorkspaceTypes';

const NAV_ITEMS: Array<{ id: SocialSection; icon: IconSvgElement; labelKey: string }> = [
  { id: 'overview', icon: DashboardSquare01Icon, labelKey: 'social.studio.nav.overview' },
  { id: 'content', icon: File02Icon, labelKey: 'social.studio.nav.content' },
  { id: 'campaigns', icon: Megaphone02Icon, labelKey: 'social.studio.nav.campaigns' },
  { id: 'references', icon: Bookmark01Icon, labelKey: 'social.studio.nav.references' },
  { id: 'trends', icon: BarChartIcon, labelKey: 'social.studio.nav.trends' },
  { id: 'automations', icon: MagicWand01Icon, labelKey: 'social.direct.title' },
  { id: 'events', icon: Calendar03Icon, labelKey: 'social.studio.nav.events' },
  { id: 'insights', icon: BarChartIcon, labelKey: 'social.studio.nav.insights' },
  { id: 'inbox', icon: BubbleChatIcon, labelKey: 'social.studio.nav.inbox' },
  { id: 'accounts', icon: UserMultiple02Icon, labelKey: 'social.studio.nav.accounts' },
];

export function SocialStudioNav({
  section,
  onNavigate,
  accounts,
  accountId,
  onAccountId,
  refreshing,
  error,
  lastSyncAt,
  onSync,
  onCompose,
}: {
  section: SocialSection;
  onNavigate: (section: SocialSection) => void;
  accounts: SocialAccount[];
  accountId: string;
  onAccountId: (value: string) => void;
  refreshing: boolean;
  error: string | null;
  lastSyncAt: number | null;
  onSync: () => void;
  onCompose: () => void;
}) {
  const { t } = useTranslation();
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const syncAt = selectedAccount ? selectedAccount.lastSyncAt : lastSyncAt;
  const activeAccounts = accounts.filter((account) => account.status === 'active').length;

  return (
    <>
      <HubToolbar>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Tabs
            value={section}
            onValueChange={(value) => {
              if (typeof value === 'string') onNavigate(value as SocialSection);
            }}
          >
            <TabsList variant="line" aria-label={t('social.studio.header.sections')} className="h-8 min-w-max">
              {NAV_ITEMS.map((item) => (
                <TabsTrigger key={item.id} value={item.id} className="px-2.5">
                  <HugeiconsIcon icon={item.icon} data-icon="inline-start" />
                  {t(item.labelKey)}
                  {item.id === 'accounts' && activeAccounts > 0 ? (
                    <Badge variant="outline">{activeAccounts}</Badge>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Select
            value={accountId}
            onValueChange={(value) => onAccountId(value ?? 'all')}
          >
            <SelectTrigger size="sm" className="h-8 max-w-44" aria-label={t('social.agent_filter_all')}>
              <SelectValue>
                {accountId === 'all'
                  ? t('social.agent_filter_all')
                  : selectedAccount
                    ? socialAccountLabel(selectedAccount)
                    : t('social.agent_filter_all')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{t('social.agent_filter_all')}</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {socialAccountLabel(account)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={onSync}
            disabled={refreshing || (selectedAccount ? selectedAccount.status !== 'active' : activeAccounts === 0)}
            aria-label={t('social.hub.sync_feed')}
            title={syncAt ? new Date(syncAt).toLocaleString() : t('social.hub.sync_feed')}
          >
            {refreshing ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}
          </Button>
          {section !== 'accounts' ? (
            <Button type="button" size="sm" onClick={onCompose}>
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              {t('social.hub.new_post')}
            </Button>
          ) : null}
        </div>
      </HubToolbar>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
