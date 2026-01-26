'use client';

import { useEffect, useState } from 'react';
import SettingsLayout from '@/components/settings/SettingsLayout';
import GeneralSettings from '@/components/settings/GeneralSettings';
import AppearanceSettings from '@/components/settings/AppearanceSettings';
import AISettingsPanel from '@/components/settings/AISettingsPanel';
import WhatsAppSettingsPanel from '@/components/settings/WhatsAppSettingsPanel';
import AdvancedSettings from '@/components/settings/AdvancedSettings';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';

type SettingsSection = 'general' | 'appearance' | 'ai' | 'whatsapp' | 'advanced';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');
  const { loadUserProfile } = useUserStore();
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    // Load user data when settings page opens
    loadUserProfile();
    loadPreferences();
  }, [loadUserProfile, loadPreferences]);

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'ai':
        return <AISettingsPanel />;
      case 'whatsapp':
        return <WhatsAppSettingsPanel />;
      case 'advanced':
        return <AdvancedSettings />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <SettingsLayout activeSection={activeSection} onSectionChange={setActiveSection}>
      {renderSection()}
    </SettingsLayout>
  );
}
