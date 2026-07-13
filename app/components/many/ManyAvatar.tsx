import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import ManyIcon from './ManyIcon';

export type ManyAvatarState = 'idle' | 'thinking' | 'speaking';

interface ManyAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  state?: ManyAvatarState;
  showStateDot?: boolean;
  className?: string;
}

const avatarSize: Record<string, 'sm' | 'default' | 'lg'> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  xl: 'lg',
};

const iconSizes: Record<string, number> = { sm: 16, md: 20, lg: 40, xl: 40 };

export default function ManyAvatar({
  size = 'md',
  state = 'idle',
  showStateDot = false,
  className = '',
}: ManyAvatarProps) {
  const shadcnSize = avatarSize[size] ?? 'default';
  const iconSize = iconSizes[size] ?? 20;
  const isLg = size === 'lg' || size === 'xl';

  return (
    <Avatar
      size={shadcnSize}
      className={cn(
        'bg-primary/10 text-primary',
        isLg ? 'rounded-[20px]' : 'rounded-full',
        state === 'thinking' && 'ring-2 ring-primary/30',
        state === 'speaking' && 'ring-2 ring-success/40',
        className,
      )}
    >
      <AvatarImage src="/many.png" alt="Many" />
      <AvatarFallback className="bg-primary/10">
        <ManyIcon size={iconSize} />
      </AvatarFallback>
      {showStateDot && state !== 'idle' ? (
        <AvatarBadge
          className={cn(
            'bg-warning',
            state === 'speaking' && 'bg-success',
          )}
        />
      ) : null}
    </Avatar>
  );
}
