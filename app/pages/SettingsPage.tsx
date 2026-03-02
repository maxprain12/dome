import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsLayout from '@/components/settings/SettingsLayout';
import GeneralSettings from '@/components/settings/GeneralSettings';
import AppearanceSettings from '@/components/settings/AppearanceSettings';
import AISettingsPanel from '@/components/settings/AISettingsPanel';
import WhatsAppSettingsPanel from '@/components/settings/WhatsAppSettingsPanel';
import MCPSettingsPanel from '@/components/settings/MCPSettingsPanel';
import SkillsSettingsPanel from '@/components/settings/SkillsSettingsPanel';
import AdvancedSettings from '@/components/settings/AdvancedSettings';
import PluginsSettings from '@/components/settings/PluginsSettings';
import IndexingSettings from '@/components/settings/IndexingSettings';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';

type SettingsSection = 'general' | 'appearance' | 'ai' | 'whatsapp' | 'mcp' | 'skills' | 'plugins' | 'advanced' | 'indexing';

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as SettingsSection | null;
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    sectionParam && ['general', 'appearance', 'ai', 'whatsapp', 'mcp', 'skills', 'plugins', 'advanced', 'indexing'].includes(sectionParam)
      ? sectionParam
      : 'general'
  );
  const { loadUserProfile } = useUserStore();

  useEffect(() => {
    if (sectionParam && ['general', 'appearance', 'ai', 'whatsapp', 'mcp', 'skills', 'plugins', 'advanced', 'indexing'].includes(sectionParam)) {
      setActiveSection(sectionParam);
    }
  }, [sectionParam]);

  // Listen for navigate-to-section when settings window is focused from another context
  useEffect(() => {
    const unsub = window.electron?.on?.('settings:navigate-to-section', (section: string) => {
      if (['general', 'appearance', 'ai', 'whatsapp', 'mcp', 'skills', 'plugins', 'advanced', 'indexing'].includes(section)) {
        setActiveSection(section as SettingsSection);
      }
    });
    return () => unsub?.();
  }, []);
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
      case 'mcp':
        return <MCPSettingsPanel />;
      case 'skills':
        return <SkillsSettingsPanel />;
      case 'plugins':
        return <PluginsSettings />;
      case 'advanced':
        return <AdvancedSettings />;
      case 'indexing':
        return <IndexingSettings />;
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
