
import { getInitials } from '@/lib/utils/validation';
import { useState, useEffect } from 'react';

interface UserAvatarProps {
  name: string;
  /** Base64 data URL (data:image/...) or undefined for initials - Legacy */
  avatarData?: string;
  /** Relative path to avatar file (e.g., "avatars/user-avatar-123.jpg") - New */
  avatarPath?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

// Join paths using standard path.join (available in Next.js renderer)
// Note: We can't use Node.js path module directly in browser context,
// so we use a simple string concatenation with proper separator
function buildFileUrl(userDataPath: string, avatarPath: string): string {
  const separator = userDataPath.endsWith('/') || userDataPath.endsWith('\\') ? '' : '/';
  const fullPath = `${userDataPath}${separator}${avatarPath}`;
  // Convert to file:// URL (handle Windows paths) — ensure forward slashes
  const normalizedPath = fullPath.replace(/\\/g, '/');
  return `file://${normalizedPath}`;
}

async function resolveFromElectron(avatarPath: string): Promise<string | null> {
  const userDataPath = await window.electron.getUserDataPath();
  if (!userDataPath) {
    console.warn('[UserAvatar] Failed to get userData path');
    return null;
  }
  return buildFileUrl(userDataPath, avatarPath);
}

async function resolveAvatarUrl(
  avatarPath: string | undefined,
  avatarData: string | undefined,
): Promise<string | null> {
  if (avatarPath) {
    if (typeof window !== 'undefined' && window.electron) {
      return resolveFromElectron(avatarPath);
    }
    // Fallback for non-electron env (e.g. web dev) — won't work for local files but prevents crash
    console.warn('[UserAvatar] Avatar path exists but window.electron is missing. Cannot resolve local file.');
    return null;
  }
  if (avatarData && avatarData.startsWith('data:image/')) {
    return avatarData;
  }
  return null;
}

export default function UserAvatar({ name, avatarData, avatarPath, size = 'md', className = '' }: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Build avatar URL from path or data
  useEffect(() => {
    let mounted = true;

    const resolveAvatar = async () => {
      if (!mounted) return;
      try {
        const resolved = await resolveAvatarUrl(avatarPath, avatarData);
        if (mounted) setAvatarUrl(resolved);
      } catch (err) {
        console.error('[UserAvatar] Error resolving avatar path:', err);
        if (mounted) setAvatarUrl(null);
      }
    };

    resolveAvatar();

    return () => {
      mounted = false;
    };
  }, [avatarPath, avatarData]);

  const handleImageError = () => {
    setImageError(true);
    setAvatarUrl(null);
  };

  const initials = getInitials(name);
  const sizeClass = sizeClasses[size];

  // Check if we have a valid avatar (path or data)
  const hasValidAvatar = avatarUrl && !imageError;

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-medium ${className}`}
      style={{
        backgroundColor: hasValidAvatar ? 'transparent' : 'var(--primary)',
        color: hasValidAvatar ? 'transparent' : 'var(--primary-foreground)',
      }}
    >
      {hasValidAvatar ? (
        <img
          src={avatarUrl}
          alt={name}
          className="size-full rounded-full object-cover"
          onError={handleImageError}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

