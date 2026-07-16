import { cn } from '@/lib/utils';

interface ManyIconProps {
  size?: number;
  className?: string;
}

/** Many brand mark. Plain image, no chrome — wrap in ManyAvatar for state. */
export default function ManyIcon({ size = 24, className }: ManyIconProps) {
  return (
    <img
      src="/many.png"
      alt="Many"
      width={size}
      height={size}
      draggable={false}
      className={cn('select-none object-contain', className)}
    />
  );
}
