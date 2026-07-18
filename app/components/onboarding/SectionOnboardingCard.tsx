import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { HelpCircleIcon } from '@hugeicons/core-free-icons';
import { getSectionGuide } from '@/lib/onboarding/sectionGuides';
import { useSectionTourStore } from '@/lib/store/useSectionTourStore';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
interface SectionGuideProps {
  sectionKey: string;
  className?: string;
}

function SectionGuideSteps({ sectionKey }: { sectionKey: string }) {
  const { t } = useTranslation();
  const guide = getSectionGuide(sectionKey);
  if (!guide) return null;

  return (
    <ol className="flex flex-col gap-2.5">
      {guide.stepKeys.map((stepKey, i) => (
        <li
          key={stepKey}
          className="flex items-start gap-2.5 text-sm text-muted-foreground"
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
            {i + 1}
          </span>
          <span className="leading-snug pt-0.5">{t(stepKey)}</span>
        </li>
      ))}
    </ol>
  );
}

function SectionGuideModal({
  sectionKey,
  open,
  onClose,
}: {
  sectionKey: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dismiss = useSectionTourStore((s) => s.dismiss);
  const guide = getSectionGuide(sectionKey);
  if (!guide) return null;

  const handleGotIt = () => {
    void dismiss(sectionKey);
    onClose();
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="sm">
        <AppModalHeader title={t(guide.titleKey)} />
        <AppModalBody>
          <SectionGuideSteps sectionKey={sectionKey} />
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" onClick={handleGotIt} size="sm">
            {t('sectionGuide.got_it')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

/** `?` button beside a section title; opens the guide in a modal. */
export function SectionGuideHelp({ sectionKey, className }: SectionGuideProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const load = useSectionTourStore((s) => s.load);
  const loaded = useSectionTourStore((s) => s.loaded);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  if (!getSectionGuide(sectionKey)) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={t('sectionGuide.help_aria')}
        title={t('sectionGuide.help_aria')}
        className={className}
      >
        <HugeiconsIcon icon={HelpCircleIcon} className="size-4" />
      </Button>
      <SectionGuideModal sectionKey={sectionKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
