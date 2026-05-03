import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsLayout, { type SettingsSection } from '@/components/settings/SettingsLayout';
import GeneralSettings from '@/components/settings/GeneralSettings';
import AppearanceSettings from '@/components/settings/AppearanceSettings';
import AISettingsPanel from '@/components/settings/AISettingsPanel';
import WhatsAppSettingsPanel from '@/components/settings/WhatsAppSettingsPanel';
import MCPSettingsPanel from '@/components/settings/MCPSettingsPanel';
import SkillsSettingsPanel from '@/components/settings/SkillsSettingsPanel';
import AdvancedSettings from '@/components/settings/AdvancedSettings';
import PluginsSettings from '@/components/settings/PluginsSettings';
import IndexingSettings from '@/components/settings/IndexingSettings';
import CloudStorageSettings from '@/components/settings/CloudStorageSettings';
import LanguageSettings from '@/components/settings/LanguageSettings';
import TranscriptionSettingsPanel from '@/components/settings/TranscriptionSettingsPanel';
import KbLlmSettingsPanel from '@/components/settings/KbLlmSettingsPanel';
import CalendarSettingsPanel from '@/components/settings/CalendarSettingsPanel';
import DomeMcpServerSettings from '@/components/settings/DomeMcpServerSettings';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';

const VALID_SECTIONS = [
  'general',
  'appearance',
  'ai',
  'transcription',
  'whatsapp',
  'mcp',
  'dome_mcp',
  'skills',
  'plugins',
  'advanced',
  'indexing',
  'cloud',
  'language',
  'kb_llm',
  'calendar',
] as const;

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section') as SettingsSection | null;
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    sectionParam && VALID_SECTIONS.includes(sectionParam as SettingsSection)
      ? sectionParam as SettingsSection
      : 'general'
  );
  const { loadUserProfile } = useUserStore();

  useEffect(() => {
    if (sectionParam && VALID_SECTIONS.includes(sectionParam as SettingsSection)) {
      setActiveSection(sectionParam as SettingsSection);
    }
  }, [sectionParam]);

  // Listen for navigate-to-section from IPC or sidebar custom event
  useEffect(() => {
    const unsub = window.electron?.on?.('settings:navigate-to-section', (section: string) => {
      if (VALID_SECTIONS.includes(section as SettingsSection)) {
        setActiveSection(section as SettingsSection);
      }
    });
    const handleCustomNav = (e: Event) => {
      const section = (e as CustomEvent<string>).detail;
      if (VALID_SECTIONS.includes(section as SettingsSection)) {
        setActiveSection(section as SettingsSection);
      }
    };
    window.addEventListener('dome:goto-settings-section', handleCustomNav);
    return () => {
      unsub?.();
      window.removeEventListener('dome:goto-settings-section', handleCustomNav);
    };
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
      case 'transcription':
        return <TranscriptionSettingsPanel />;
      case 'whatsapp':
        return <WhatsAppSettingsPanel />;
      case 'mcp':
        return <MCPSettingsPanel />;
      case 'dome_mcp':
        return <DomeMcpServerSettings />;
      case 'skills':
        return <SkillsSettingsPanel />;
      case 'plugins':
        return <PluginsSettings />;
      case 'advanced':
        return <AdvancedSettings />;
      case 'indexing':
        return <IndexingSettings />;
      case 'cloud':
        return <CloudStorageSettings />;
      case 'language':
        return <LanguageSettings />;
      case 'kb_llm':
        return <KbLlmSettingsPanel />;
      case 'calendar':
        return <CalendarSettingsPanel />;
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
