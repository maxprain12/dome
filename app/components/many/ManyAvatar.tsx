import { cn } from '@/lib/utils';
import ManyIcon from './ManyIcon';

export type ManyAvatarState = 'idle' | 'thinking' | 'speaking';

interface ManyAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  state?: ManyAvatarState;
  /** Show colored state dot in the bottom-right corner */
  showStateDot?: boolean;
  className?: string;
}

const sizePx: Record<string, number> = { sm: 28, md: 36, lg: 72, xl: 64 };
const iconSizes: Record<string, number> = { sm: 16, md: 20, lg: 40, xl: 40 };

export default function ManyAvatar({
  size = 'md',
  state = 'idle',
  showStateDot = false,
  className = '',
}: ManyAvatarProps) {
  const px = sizePx[size] ?? 36;
  const iconSize = iconSizes[size] ?? 20;
  const isLg = size === 'lg';

  const ringPad = state === 'thinking' || state === 'speaking' ? 4 : 0;
  const wrapSize = px + ringPad * 2;

  return (
    <div
      className="many-avatar-wrap"
      style={{ width: wrapSize, height: wrapSize }}
    >
      <div
        className={cn(
          'many-avatar flex items-center justify-center relative bg-[var(--accent-bg)] text-[var(--accent)]',
          isLg ? 'rounded-[20px]' : 'rounded-full',
          `many-avatar--${state}`,
          className,
        )}
        style={{ width: px, height: px }}
      >
      <ManyIcon size={iconSize} />
      {showStateDot && (
        <span
          aria-hidden
          className={cn(
            'many-avatar-dot',
            state === 'thinking' && 'many-avatar-dot--thinking',
            state === 'speaking' && 'many-avatar-dot--speaking',
          )}
        />
      )}
      </div>
    </div>
  );
}
