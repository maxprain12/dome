interface ManyIconProps {
  className?: string;
  size?: number;
  primaryColor?: string;
  darkColor?: string;
}

export default function ManyIcon({
  className = '',
  size = 24,
}: ManyIconProps) {
  return (
    <img
      src="/many.png"
      alt="Many"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
}
