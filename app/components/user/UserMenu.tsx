
import { useState, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Logout01Icon, Settings01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/lib/store/useUserStore';
import UserAvatar from './UserAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

export default function UserMenu() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const { name, email, avatarData, avatarPath, resetOnboarding, updateUserProfile } = useUserStore();

  const handleOpenSettings = () => {
    setIsOpen(false);
    if (typeof window !== 'undefined' && window.electron) {
      window.electron.openSettings();
    }
  };

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    
    setIsSigningOut(true);
    
    try {
      await Promise.all([
        updateUserProfile({ name: '', email: '', avatarPath: undefined, avatarData: undefined }),
        resetOnboarding(),
      ]);
      
      setIsOpen(false);
      
      // Reload the app to show onboarding
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error(t('userMenu.sign_out_error'));
    } finally {
      setIsSigningOut(false);
    }
  }, [isSigningOut, updateUserProfile, resetOnboarding, t]);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={t('userMenu.menu_aria', { name: name || t('userMenu.default_name') })} />}>
        <UserAvatar name={name || t('userMenu.default_name')} avatarData={avatarData} avatarPath={avatarPath} size="md" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
          {/* User Info */}
          <div className="px-4 py-3 border-b overflow-hidden border-border">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar name={name || t('userMenu.default_name')} avatarData={avatarData} avatarPath={avatarPath} size="lg" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-foreground">
                  {name || t('userMenu.default_name')}
                </div>
                <div className="text-xs truncate text-muted-foreground">
                  {email || t('userMenu.no_email')}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={handleOpenSettings}
              aria-label={t('userMenu.open_settings')}
            >
              <HugeiconsIcon icon={Settings01Icon} />
              <span className="text-sm">{t('userMenu.settings')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => setConfirmSignOut(true)}
              disabled={isSigningOut}
              variant="destructive"
              aria-label={t('userMenu.sign_out')}
            >
              <HugeiconsIcon icon={Logout01Icon} />
              <span className="text-sm">{isSigningOut ? t('userMenu.signingOut') : t('userMenu.signOut')}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
      </DropdownMenuContent>
      <ConfirmDialog
        isOpen={confirmSignOut}
        title={t('userMenu.confirm_sign_out')}
        message={t('userMenu.confirm_sign_out')}
        variant="danger"
        onConfirm={() => { setConfirmSignOut(false); void handleSignOut(); }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </DropdownMenu>
  );
}
