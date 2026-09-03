import { useTranslation } from 'react-i18next';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  BarChartIcon,
  Calendar03Icon,
  DashboardSquare01Icon,
  File02Icon,
  Megaphone02Icon,
  RefreshIcon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
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
import { socialNetworkTitle } from '@/components/social/crm/socialCrmChrome';
import { socialAccountLabel } from '@/lib/social/socialQueues';
import type { SocialSection } from './socialWorkspaceTypes';

const NAV_ITEMS: Array<{ id: SocialSection; icon: IconSvgElement; labelKey: string }> = [
  { id: 'overview', icon: DashboardSquare01Icon, labelKey: 'social.studio.nav.overview' },
  { id: 'content', icon: File02Icon, labelKey: 'social.studio.nav.content' },
  { id: 'campaigns', icon: Megaphone02Icon, labelKey: 'social.studio.nav.campaigns' },
  { id: 'events', icon: Calendar03Icon, labelKey: 'social.studio.nav.events' },
  { id: 'insights', icon: BarChartIcon, labelKey: 'social.studio.nav.insights' },
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
}) {
  const { t } = useTranslation();
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const activeAccounts = accounts.filter((account) => account.status === 'active').length;
  const networkTitle = socialNetworkTitle(
    accounts,
    accountId,
    t('social.studio.overview.all_networks'),
  );

  return (
    <header className="shrink-0 border-b bg-background">
      <div className="flex items-end justify-between gap-3 px-4 pb-1 pt-3">
        <h1 className="text-xl font-semibold tracking-tight">{networkTitle}</h1>
        <div className="flex items-center gap-2">
          <Select
            value={accountId}
            onValueChange={(value) => onAccountId(value ?? 'all')}
          >
            <SelectTrigger size="sm" className="h-6 max-w-48" aria-label={t('social.agent_filter_all')}>
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
            disabled={refreshing}
            aria-label={t('social.hub.sync_feed')}
            title={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : t('social.hub.sync_feed')}
          >
            {refreshing ? <Spinner /> : <HugeiconsIcon icon={RefreshIcon} />}
          </Button>
          {error ? <Badge variant="destructive">{t('social.hub.sync_badge_error')}</Badge> : null}
        </div>
      </div>
      <div className="overflow-x-auto px-4">
        <Tabs
          value={section}
          onValueChange={(value) => onNavigate(value as SocialSection)}
        >
          <TabsList variant="line" aria-label={t('social.studio.header.sections')} className="h-10 min-w-max gap-2">
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
    </header>
  );
}
