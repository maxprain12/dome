
interface MartinIconProps {
  className?: string;
  size?: number;
  primaryColor?: string; // Optional: kept for API compatibility (PNG has fixed colors)
  darkColor?: string; // Optional: kept for API compatibility (PNG has fixed colors)
}

export default function MartinIcon({
  className = '',
  size = 24,
}: MartinIconProps) {
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
