import { Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SettingsShell from '@/components/settings/SettingsShell';
import {
  getSettingsEntry,
  resolveSettingsSection,
  type SettingsSection,
} from '@/components/settings/registry';
import { Spinner } from '@/components/ui/spinner';
import { useUserStore } from '@/lib/store/useUserStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useSettingsUiStore } from '@/lib/store/useSettingsUiStore';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';

export const normalizeSection = resolveSettingsSection;

export default function SettingsPage() {
  const [searchParams] = useSearchParams();
  const sectionParam = searchParams.get('section');
  const activeSection = useSettingsUiStore((s) => s.activeSection);
  const setActiveSection = useSettingsUiStore((s) => s.setActiveSection);
  const setHiddenSections = useSettingsUiStore((s) => s.setHiddenSections);
  const { loadUserProfile } = useUserStore();
  const { loadPreferences } = useAppStore();
  const cloudEntitlements = useCloudEntitlements();

  useEffect(() => {
    if (sectionParam) {
      setActiveSection(resolveSettingsSection(sectionParam));
    }
  }, [sectionParam, setActiveSection]);

  // Section navigation arrives from three channels: the URL param above, the
  // main process (`settings:navigate-to-section`) and in-app dispatches
  // (`dome:goto-settings-section`).
  useEffect(() => {
    const unsub = window.electron?.on?.('settings:navigate-to-section', (section: string) => {
      setActiveSection(resolveSettingsSection(section));
    });
    const handleCustomNav = (e: Event) => {
      const section = (e as CustomEvent<string>).detail;
      setActiveSection(resolveSettingsSection(section));
    };
    window.addEventListener('dome:goto-settings-section', handleCustomNav);
    return () => {
      unsub?.();
      window.removeEventListener('dome:goto-settings-section', handleCustomNav);
    };
  }, [setActiveSection]);

  const hiddenSections = useMemo(() => {
    const hidden = new Set<SettingsSection>();
    if (!cloudEntitlements.loading && !cloudEntitlements.showCloudUi) {
      hidden.add('dome_sync');
    }
    return hidden;
  }, [cloudEntitlements.loading, cloudEntitlements.showCloudUi]);

  useEffect(() => {
    setHiddenSections(hiddenSections);
  }, [hiddenSections, setHiddenSections]);

  useEffect(() => {
    if (cloudEntitlements.loading) return;
    if (activeSection === 'dome_sync' && !cloudEntitlements.showCloudUi) {
      setActiveSection('general');
    }
  }, [activeSection, cloudEntitlements.loading, cloudEntitlements.showCloudUi, setActiveSection]);

  useEffect(() => {
    loadUserProfile();
    loadPreferences();
  }, [loadUserProfile, loadPreferences]);

  const ActiveSectionComponent = getSettingsEntry(activeSection).component;

  return (
    <SettingsShell>
      <Suspense
        fallback={
          <div className="flex min-h-48 items-center justify-center">
            <Spinner />
          </div>
        }
      >
        <ActiveSectionComponent />
      </Suspense>
    </SettingsShell>
  );
}
