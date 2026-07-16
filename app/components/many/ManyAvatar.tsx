import { cn } from '@/lib/utils';
import ManyIcon from './ManyIcon';

export type ManyAvatarState = 'idle' | 'thinking' | 'speaking';

interface ManyAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  state?: ManyAvatarState;
  showStateDot?: boolean;
  className?: string;
}

const WRAPPER_SIZE: Record<NonNullable<ManyAvatarProps['size']>, string> = {
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-14',
  xl: 'size-16',
};

/**
 * The Many mark, shown bare (no circle / halo chrome).
 * Optional corner dot for thinking/speaking when `showStateDot` is set.
 */
export default function ManyAvatar({
  size = 'md',
  state = 'idle',
  showStateDot = false,
  className,
}: ManyAvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', WRAPPER_SIZE[size], className)}>
      <ManyIcon className="absolute inset-[8%] size-[84%]" />
      {showStateDot && state !== 'idle' ? (
        <span
          aria-hidden
          className={cn(
            'absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-background',
            state === 'thinking' ? 'bg-warning' : 'bg-success',
          )}
        />
      ) : null}
    </span>
  );
}
