'use client';

import { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import UserAvatar from '@/components/user/UserAvatar';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { selectAndCopyAvatar } from '@/lib/settings/avatar';

export default function GeneralSettings() {
  const { name, email, avatarData, avatarPath, updateUserProfile, setAvatarPath, loadUserProfile } = useUserStore();
  const [localName, setLocalName] = useState(name);
  const [localEmail, setLocalEmail] = useState(email);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [isSaved, setIsSaved] = useState(false);

  // Load user profile on mount
  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  // Sync local state when store changes
  useEffect(() => {
    setLocalName(name);
    setLocalEmail(email);
  }, [name, email]);

  const handleSave = () => {
    const newErrors: { name?: string; email?: string } = {};

    if (!validateName(localName)) {
      newErrors.name = 'Please enter a valid name (at least 2 characters)';
    }

    if (!validateEmail(localEmail)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    
    // Debug: log email details to diagnose truncation issue
    const trimmedEmail = localEmail.trim();
    console.log(`[GeneralSettings] Saving email:`);
    console.log(`[GeneralSettings]   - Original: "${localEmail}"`);
    console.log(`[GeneralSettings]   - Trimmed: "${trimmedEmail}"`);
    console.log(`[GeneralSettings]   - Length: ${trimmedEmail.length}`);
    
    updateUserProfile({
      name: localName.trim(),
      email: trimmedEmail,
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleChangeAvatar = async () => {
    const relativePath = await selectAndCopyAvatar();

    if (relativePath) {
      // Save relative path to database
      await setAvatarPath(relativePath);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPath(null);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-medium mb-1" style={{ color: 'var(--primary)' }}>
          General
        </h2>
        <p className="text-sm opacity-70" style={{ color: 'var(--secondary)' }}>
          Manage your profile and account settings
        </p>
      </div>

      {/* Avatar Section */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary)' }}>
          Profile Picture
        </h3>

        <div className="flex items-center gap-8">
          <div className="relative group cursor-pointer" onClick={handleChangeAvatar}>
            <UserAvatar name={localName || 'User'} avatarData={avatarData} avatarPath={avatarPath} size="xl" />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button
                onClick={handleChangeAvatar}
                className="px-4 py-2 text-sm font-medium rounded-md transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-95"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--primary)',
                  border: '1px solid var(--border)',
                }}
              >
                Change Avatar
              </button>
              {(avatarData || avatarPath) && (
                <button
                  onClick={handleRemoveAvatar}
                  className="px-4 py-2 text-sm font-medium rounded-md text-red-500 transition-all hover:bg-red-50 dark:hover:bg-red-900/10 active:scale-95"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs opacity-60 max-w-[200px]" style={{ color: 'var(--secondary)' }}>
              Recommended: Square JPG, PNG, or GIF, at least 400x400.
            </p>
          </div>
        </div>
      </section>

      {/* Profile Information */}
      <section className="max-w-md">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6 opacity-60" style={{ color: 'var(--secondary)' }}>
          Personal Details
        </h3>

        <div className="space-y-6">
          <div className="group">
            <label htmlFor="user-name" className="block text-sm font-medium mb-2 transition-colors group-focus-within:text-blue-500" style={{ color: 'var(--primary)' }}>
              Full Name
            </label>
            <input
              id="user-name"
              type="text"
              value={localName}
              onChange={(e) => {
                setLocalName(e.target.value);
                if (errors.name && validateName(e.target.value)) {
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              placeholder="John Doe"
              autoComplete="name"
              className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 transition-colors"
              style={{
                color: 'var(--primary)',
                borderColor: errors.name ? 'var(--error)' : 'var(--border)',
              }}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div className="group">
            <label htmlFor="user-email" className="block text-sm font-medium mb-2 transition-colors group-focus-within:text-blue-500" style={{ color: 'var(--primary)' }}>
              Email Address
            </label>
            <input
              id="user-email"
              type="text"
              inputMode="email"
              value={localEmail}
              onChange={(e) => {
                const value = e.target.value;
                console.log(`[GeneralSettings] Email onChange: "${value}" (length: ${value.length})`);
                setLocalEmail(value);
                if (errors.email && validateEmail(value)) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              placeholder="john@example.com"
              autoComplete="email"
              className="w-full px-0 py-2 bg-transparent border-b text-sm focus:outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 transition-colors"
              style={{
                color: 'var(--primary)',
                borderColor: errors.email ? 'var(--error)' : 'var(--border)',
              }}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button
              onClick={handleSave}
              className="px-6 py-2 text-sm font-medium text-white rounded-full shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                backgroundColor: 'var(--brand-primary)',
              }}
            >
              Save Changes
            </button>
            {isSaved && (
              <span className="text-sm text-green-600 animate-in fade-in slide-in-from-left-2">Saved successfully</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
