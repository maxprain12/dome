import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';
import { SocialCoverMosaic } from './SocialCoverMosaic';

export function SocialCreatorPick({
  selected,
  onClick,
  name,
  handle,
  provider,
  avatarUrl,
  covers,
  meta,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  handle?: string | null;
  provider?: string | null;
  avatarUrl?: string | null;
  covers: string[];
  meta?: string | null;
}) {
  const subtitle = [handle, provider, meta].filter(Boolean).join(' · ');
  return (
    <li className="px-2 py-1">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          selectionSurfaceClass(selected, 'flex w-full flex-col overflow-hidden p-0 text-left'),
        )}
      >
        <SocialCoverMosaic covers={covers} className="h-[4.75rem]" />
        <div className="relative z-10 flex items-center gap-3 px-3 py-2.5">
          <SocialAccountAvatar name={name} src={avatarUrl} size="lg" className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{name}</p>
            {subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}
