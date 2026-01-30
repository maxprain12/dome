'use client';

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
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

export default function UserAvatar({ name, avatarData, avatarPath, size = 'md', className = '' }: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Build avatar URL from path or data
  useEffect(() => {
    let mounted = true;

    const resolveAvatar = async () => {
      if (!mounted) return;

      if (avatarPath && typeof window !== 'undefined' && window.electron) {
        try {
          // Get userData path
          const userDataPath = await window.electron.getUserDataPath();
          if (!userDataPath) {
            console.warn('[UserAvatar] Failed to get userData path');
            if (mounted) setAvatarUrl(null);
            return;
          }

          // Join paths using standard path.join (available in Next.js renderer)
          // Note: We can't use Node.js path module directly in browser context,
          // so we use a simple string concatenation with proper separator
          const separator = userDataPath.endsWith('/') || userDataPath.endsWith('\\') ? '' : '/';
          const fullPath = `${userDataPath}${separator}${avatarPath}`;

          // Convert to file:// URL (handle Windows paths)
          // We ensure forward slashes for the URL
          const normalizedPath = fullPath.replace(/\\/g, '/');
          const fileUrl = `file://${normalizedPath}`; // Removed extra slash logic as fullPath usually starts with / on mac/linux or drive on windows

          // Add timestamp to prevent caching if it's the same filename (though our filenames are timestamped)
          // But just in case
          if (mounted) setAvatarUrl(fileUrl);
        } catch (err) {
          console.error('[UserAvatar] Error resolving avatar path:', err);
          if (mounted) setAvatarUrl(null);
        }
      } else if (avatarData && avatarData.startsWith('data:image/')) {
        if (mounted) setAvatarUrl(avatarData);
      } else if (avatarPath) {
        // Fallback for non-electron env (e.g. web dev) - this won't work for local files but prevents crash
        console.warn('[UserAvatar] Avatar path exists but window.electron is missing. Cannot resolve local file.');
        if (mounted) setAvatarUrl(null);
      } else {
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
        backgroundColor: hasValidAvatar ? 'transparent' : 'var(--accent)',
        color: hasValidAvatar ? 'transparent' : 'white',
      }}
    >
      {hasValidAvatar ? (
        <img
          src={avatarUrl}
          alt={name}
          className="w-full h-full rounded-full object-cover"
          onError={handleImageError}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

