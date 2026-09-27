import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@hugeicons/react';
import { HelpCircleIcon } from '@hugeicons/core-free-icons';
import { getSectionGuide } from '@/lib/onboarding/sectionGuides';
import { guideAction, reviewedStepKey, runGuideAction } from '@/lib/onboarding/sectionActions';
import { useSectionTourStore } from '@/lib/store/useSectionTourStore';
import { useUserStore } from '@/lib/store/useUserStore';
import SectionSetup from './SectionSetup';

/** A section's setup destination. Existing work stays mounted while the guide is open. */
export default function SectionOnboardingCard({ sectionKey, children, active = true, autoOpen = true }: { sectionKey: string; children?: ReactNode; active?: boolean; autoOpen?: boolean }) {
  const { t } = useTranslation();
  const completed = useUserStore((s) => s.isOnboardingCompleted);
  const name = useUserStore((s) => s.name);
  const { seen, loaded, load, dismiss } = useSectionTourStore();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(0);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const guide = getSectionGuide(sectionKey);
  const helpButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => { if (completed && !loaded) void load(); }, [completed, loaded, load]);
  const available = guide && loaded && completed && active;
  const open = Boolean(available && (expanded || (autoOpen && !seen[sectionKey])));
  useEffect(() => {
    if (wasOpen.current && !open && active) helpButton.current?.focus();
    wasOpen.current = open;
  }, [open, active]);
  async function close(action?: () => void) {
    setSaving(true); setFailed(false);
    try { await dismiss(sectionKey); setExpanded(false); action?.(); }
    catch { setFailed(true); }
    finally { setSaving(false); }
  }
  async function read(openAction = false) {
    setSaving(true); setFailed(false);
    try {
      await dismiss(reviewedStepKey(sectionKey, selected));
      if (openAction) await close(() => runGuideAction(guideAction(sectionKey, selected)));
      else setSelected((selected + 1) % 3);
    } catch { setFailed(true); }
    finally { setSaving(false); }
  }
  return <>
    {available && (open ? <SectionSetup guide={guide} name={name} selected={selected} seen={seen} busy={saving} error={failed}
      onSelect={setSelected} onRead={() => { void read(); }} onAction={() => { void read(true); }}
      onClose={() => { void close(); }} onAccount={() => { void close(() => runGuideAction('sync')); }} /> :
      <div className="flex shrink-0 justify-end border-b px-4 py-1"><Button ref={helpButton} size="sm" variant="ghost" onClick={() => setExpanded(true)}><HugeiconsIcon icon={HelpCircleIcon} data-icon="inline-start" />{t('sectionGuide.setup.reopen')}</Button></div>)}
    <div hidden={open} className={open ? 'hidden' : 'relative flex min-h-0 flex-1 flex-col overflow-hidden'} aria-hidden={open || undefined}>{children}</div>
  </>;
}
