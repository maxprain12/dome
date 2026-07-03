import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsLayout, { type SettingsSection } from '@/components/settings/SettingsLayout';
import GeneralSettings from '@/components/settings/GeneralSettings';
import AppearanceSettings from '@/components/settings/AppearanceSettings';
import FeaturesSettings from '@/components/settings/FeaturesSettings';
import AISettingsPanel from '@/components/settings/AISettingsPanel';
import MCPSettingsPanel from '@/components/settings/MCPSettingsPanel';
import SkillsSettingsPanel from '@/components/settings/SkillsSettingsPanel';
import AdvancedSettings from '@/components/settings/AdvancedSettings';
import PluginsSettings from '@/components/settings/PluginsSettings';
import IndexingSettings from '@/components/settings/IndexingSettings';
import CloudStorageSettings from '@/components/settings/CloudStorageSettings';
import DomeSyncSettings from '@/components/settings/DomeSyncSettings';
import LanguageSettings from '@/components/settings/LanguageSettings';
import KbLlmSettingsPanel from '@/components/settings/KbLlmSettingsPanel';
import CalendarSettingsPanel from '@/components/settings/CalendarSettingsPanel';
import EmailSettings from '@/components/settings/EmailSettings';
import SocialSettings from '@/components/settings/SocialSettings';
import DomeMcpServerSettings from '@/components/settings/DomeMcpServerSettings';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';

const VALID_SECTIONS = [
  'general',
  'appearance',
  'features',
  'ai',
  'transcription',
  'mcp',
  'dome_mcp',
  'skills',
  'plugins',
  'advanced',
  'indexing',
  'cloud',
  'dome_sync',
  'language',
  'kb_llm',
  'calendar',
  'email',
  'social',
] as const;

function normalizeSection(section: string | null): SettingsSection {
  if (!section) return 'general';
  if (section === 'transcription') return 'ai';
  if (VALID_SECTIONS.includes(section as SettingsSection)) {
    return section as SettingsSection;
  }
  return 'general';
}

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const [activeSection, setActiveSection] = useState<SettingsSection>(
    normalizeSection(sectionParam),
  );
  const { loadUserProfile } = useUserStore();

  useEffect(() => {
    setActiveSection(normalizeSection(sectionParam));
  }, [sectionParam]);

  useEffect(() => {
    const unsub = window.electron?.on?.('settings:navigate-to-section', (section: string) => {
      setActiveSection(normalizeSection(section));
    });
    const handleCustomNav = (e: Event) => {
      const section = (e as CustomEvent<string>).detail;
      setActiveSection(normalizeSection(section));
    };
    window.addEventListener('dome:goto-settings-section', handleCustomNav);
    return () => {
      unsub?.();
      window.removeEventListener('dome:goto-settings-section', handleCustomNav);
    };
  }, []);
  const { loadPreferences } = useAppStore();

  useEffect(() => {
    loadUserProfile();
    loadPreferences();
  }, [loadUserProfile, loadPreferences]);

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'appearance':
        return <AppearanceSettings />;
      case 'features':
        return <FeaturesSettings />;
      case 'ai':
      case 'transcription':
        return <AISettingsPanel />;
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
      case 'dome_sync':
        return <DomeSyncSettings />;
      case 'language':
        return <LanguageSettings />;
      case 'kb_llm':
        return <KbLlmSettingsPanel />;
      case 'calendar':
        return <CalendarSettingsPanel />;
      case 'email':
        return <EmailSettings />;
      case 'social':
        return <SocialSettings />;
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
