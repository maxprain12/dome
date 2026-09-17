import { cn } from '@/lib/utils';

export function SocialCoverMosaic({
  covers,
  className,
}: {
  covers: string[];
  className?: string;
}) {
  if (covers.length === 0) return null;
  const cols = covers.length === 1 ? 'grid-cols-1' : covers.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  return (
    <div className={cn('relative h-36 w-full shrink-0 overflow-hidden bg-muted', className)}>
      <div className={cn('absolute inset-0 grid gap-px bg-border', cols)}>
        {covers.slice(0, 3).map((src) => (
          <div key={src} className="relative min-h-0 min-w-0 overflow-hidden bg-muted">
            <img
              src={src}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
