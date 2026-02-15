
import { useState, useEffect } from 'react';
import { useUserStore } from '@/lib/store/useUserStore';
import { validateEmail, validateName } from '@/lib/utils/validation';

export default function GeneralSettings() {
  const { name, email, updateUserProfile, loadUserProfile } = useUserStore();
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
    const trimmedEmail = localEmail.trim();

    updateUserProfile({
      name: localName.trim(),
      email: trimmedEmail,
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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
            <button onClick={handleSave} className="btn btn-primary cursor-pointer">
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
