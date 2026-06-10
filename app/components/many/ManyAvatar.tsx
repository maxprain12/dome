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
      style={{
        width: wrapSize,
        height: wrapSize,
        flexShrink: 0,
      }}
    >
      <div
        className={cn('many-avatar', `many-avatar--${state}`, className)}
        style={{
          width: px,
          height: px,
          borderRadius: isLg ? 20 : '50%',
          backgroundColor: 'var(--accent-bg)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
      <ManyIcon size={iconSize} />
      {showStateDot && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '2px solid var(--bg)',
            background:
              state === 'thinking'
                ? 'var(--warning)'
                : state === 'speaking'
                  ? 'var(--accent)'
                  : 'var(--tertiary-text)',
          }}
        />
      )}
      </div>
    </div>
  );
}
