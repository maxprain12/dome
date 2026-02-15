
import { useState, useRef, useEffect, useCallback } from 'react';
import { Settings, LogOut, User } from 'lucide-react';
import { useUserStore } from '@/lib/store/useUserStore';
import UserAvatar from './UserAvatar';

export default function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { name, email, avatarData, avatarPath, resetOnboarding, updateUserProfile } = useUserStore();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleOpenSettings = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.openSettings();
    }
  };

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    
    // Confirm sign out
    const confirmed = window.confirm(
      '¿Estás seguro de que deseas cerrar sesión?\n\nEsto restablecerá tu perfil y volverás a ver el asistente de configuración.'
    );
    
    if (!confirmed) {
      setIsOpen(false);
      return;
    }
    
    setIsSigningOut(true);
    
    try {
      await Promise.all([
        updateUserProfile({ name: '', email: '', avatarPath: null, avatarData: null }),
        resetOnboarding(),
      ]);
      
      setIsOpen(false);
      
      // Reload the app to show onboarding
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      window.alert('Error al cerrar sesión. Por favor, intenta de nuevo.');
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, updateUserProfile, resetOnboarding]);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-full transition-all hover:ring-2 hover:ring-offset-2 hover:ring-blue-500 focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
        aria-label={`Menú de usuario: ${name || 'User'}`}
        aria-expanded={isOpen}
      >
        <UserAvatar name={name || 'User'} avatarData={avatarData} avatarPath={avatarPath} size="md" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg py-2"
          style={{
            backgroundColor: 'var(--bg)',
            border: '1px solid var(--border)',
            zIndex: 'var(--z-dropdown)',
          }}
        >
          {/* User Info */}
          <div className="px-4 py-3 border-b overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar name={name || 'User'} avatarData={avatarData} avatarPath={avatarPath} size="lg" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: 'var(--primary-text)' }}>
                  {name || 'User'}
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--secondary-text)' }}>
                  {email || 'No email set'}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={handleOpenSettings}
              className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
              style={{
                color: 'var(--primary-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Open settings"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm">Settings</span>
            </button>

            {/* Divider */}
            <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />

            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full px-4 py-2 text-left flex items-center gap-3 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2 disabled:opacity-50"
              style={{ color: 'var(--error)' }}
              aria-label="Sign out"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm">{isSigningOut ? 'Cerrando sesión…' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
