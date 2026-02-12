
import { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import UserAvatar from '@/components/user/UserAvatar';
import { validateEmail, validateName } from '@/lib/utils/validation';
import { selectAndCopyAvatar, deleteAvatar } from '@/lib/settings/avatar';

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
    // Delete old avatar before setting new one
    if (avatarPath) {
      await deleteAvatar(avatarPath);
    }

    const relativePath = await selectAndCopyAvatar();

    if (relativePath) {
      // Save relative path to database
      await setAvatarPath(relativePath);
    }
  };

  const handleRemoveAvatar = async () => {
    // Delete the file before clearing the path
    if (avatarPath) {
      await deleteAvatar(avatarPath);
    }

    await setAvatarPath(null);
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h2 className="text-xl font-display font-semibold mb-1" style={{ color: 'var(--primary-text)' }}>
          General
        </h2>
        <p className="text-sm opacity-80" style={{ color: 'var(--secondary-text)' }}>
          Manage your profile and account settings
        </p>
      </div>

      {/* Avatar Section */}
      <section>
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Profile Picture
        </h3>

        <div className="flex items-center gap-8">
          <button
            type="button"
            className="relative group cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            onClick={handleChangeAvatar}
            aria-label="Change profile picture"
          >
            <UserAvatar name={localName || 'User'} avatarData={avatarData} avatarPath={avatarPath} size="xl" />
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </button>

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <button onClick={handleChangeAvatar} className="btn btn-secondary">
                Change Avatar
              </button>
              {(avatarData || avatarPath) ? (
                <button
                  onClick={handleRemoveAvatar}
                  className="btn btn-ghost text-sm font-medium transition-colors hover:bg-[var(--error-bg)]"
                  style={{ color: 'var(--error)' }}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="text-xs opacity-80 max-w-[200px]" style={{ color: 'var(--secondary-text)' }}>
              Recommended: Square JPG, PNG, or GIF, at least 400x400.
            </p>
          </div>
        </div>
      </section>

      {/* Profile Information */}
      <section className="max-w-md">
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-6" style={{ color: 'var(--secondary-text)' }}>
          Personal Details
        </h3>

        <div className="space-y-6">
          <div>
            <label htmlFor="user-name" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
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
              className="input"
              style={{
                borderColor: errors.name ? 'var(--error)' : undefined,
              }}
            />
            {errors.name ? <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.name}</p> : null}
          </div>

          <div>
            <label htmlFor="user-email" className="block text-sm font-medium mb-2" style={{ color: 'var(--primary-text)' }}>
              Email Address
            </label>
            <input
              id="user-email"
              type="text"
              inputMode="email"
              value={localEmail}
              onChange={(e) => {
                const value = e.target.value;
                setLocalEmail(value);
                if (errors.email && validateEmail(value)) {
                  setErrors((prev) => ({ ...prev, email: undefined }));
                }
              }}
              placeholder="john@example.com"
              autoComplete="email"
              className="input"
              style={{
                borderColor: errors.email ? 'var(--error)' : undefined,
              }}
            />
            {errors.email ? <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{errors.email}</p> : null}
          </div>

          <div className="pt-4 flex items-center gap-4">
            <button onClick={handleSave} className="btn btn-primary">
              Save Changes
            </button>
            {isSaved ? (
              <span className="text-sm animate-in fade-in" style={{ color: 'var(--success)' }}>Saved successfully</span>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
