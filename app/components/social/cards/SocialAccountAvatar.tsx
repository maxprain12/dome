import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function usableAvatarSrc(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('data:image/')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

export function socialInitials(label: string): string {
  const cleaned = label.replace(/^@/, '').trim();
  if (!cleaned) return '•';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function SocialAccountAvatar({
  name,
  src,
  size = 'lg',
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}) {
  const url = usableAvatarSrc(src);
  return (
    <Avatar size={size} className={cn('rounded-2xl after:rounded-2xl', className)}>
      <AvatarImage src={url} alt={name} className="rounded-2xl" referrerPolicy="no-referrer" />
      <AvatarFallback className="rounded-2xl text-xs font-semibold">
        {socialInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
