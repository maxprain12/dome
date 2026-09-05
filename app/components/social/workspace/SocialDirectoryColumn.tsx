import type { ReactNode } from 'react';
import ListState from '@/components/shared/ListState';
import {
  HubDirectoryColumn,
  type HubDirectoryColumnProps,
} from '@/components/shared/HubDirectoryColumn';
import { HubMasterDetail } from '@/components/shared/HubMasterDetail';
import { hubDirectoryRowClass } from '@/components/shared/hubChrome';

export type { SortDir, DirectoryFilterItem, HubDirectoryColumnProps } from '@/components/shared/HubDirectoryColumn';

/** Thin Social wrapper over the canonical directory rail. */
export function SocialDirectoryColumn(props: HubDirectoryColumnProps) {
  return <HubDirectoryColumn {...props} />;
}

export function SocialDirectoryRow({
  selected,
  onClick,
  mark,
  title,
  subtitle,
  meta,
}: {
  selected: boolean;
  onClick: () => void;
  mark?: ReactNode;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
}) {
  return (
    <li className="border-b border-border/80 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className={hubDirectoryRowClass(selected)}
      >
        {mark}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold">{title}</span>
          {subtitle ? (
            <span className="truncate text-[0.6875rem] text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        {meta ? (
          <span className="hidden shrink-0 text-[0.6875rem] text-muted-foreground @[16rem]/social-row:block">
            {meta}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function SocialFichaEmpty({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ListState variant="empty" icon={icon} title={title} description={description} fullHeight />
    </div>
  );
}

export function SocialHubSplit({ children }: { children: ReactNode }) {
  return (
    <HubMasterDetail className="@container/social-row">{children}</HubMasterDetail>
  );
}
