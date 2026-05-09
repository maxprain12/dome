import ManyIcon from './ManyIcon';

interface ManyAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-12',
  xl: 'size-16',
};

const iconSizes = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export default function ManyAvatar({ size = 'md', className = '' }: ManyAvatarProps) {
  const sizeClass = sizeClasses[size];
  const iconSize = iconSizes[size];

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <ManyIcon size={iconSize} />
    </div>
  );
}
