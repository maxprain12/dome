import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsLayout, { type SettingsSection } from '@/components/settings/SettingsLayout';
import { getSettingsEntry, resolveSettingsSection } from '@/components/settings/settingsNavConfig';
import { Spinner } from '@/components/ui/spinner';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';

export const normalizeSection = resolveSettingsSection;

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
  const cloudEntitlements = useCloudEntitlements();

  const hiddenSections = useMemo(() => {
    const hidden = new Set<SettingsSection>();
    if (!cloudEntitlements.loading && !cloudEntitlements.showCloudUi) {
      hidden.add('dome_sync');
    }
    return hidden;
  }, [cloudEntitlements.loading, cloudEntitlements.showCloudUi]);

  useEffect(() => {
    if (cloudEntitlements.loading) return;
    if (activeSection === 'dome_sync' && !cloudEntitlements.showCloudUi) {
      setActiveSection('general');
    }
  }, [activeSection, cloudEntitlements.loading, cloudEntitlements.showCloudUi]);

  useEffect(() => {
    loadUserProfile();
    loadPreferences();
  }, [loadUserProfile, loadPreferences]);

  const ActivePanel = getSettingsEntry(activeSection).component;

  return (
    <SettingsLayout
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      hiddenSections={hiddenSections}
    >
      <Suspense fallback={<div className="flex min-h-48 items-center justify-center"><Spinner /></div>}>
        <ActivePanel />
      </Suspense>
    </SettingsLayout>
  );
}
