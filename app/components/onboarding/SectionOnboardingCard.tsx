import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Sparkles } from 'lucide-react';
import { getSectionGuide } from '@/lib/onboarding/sectionGuides';
import { useSectionTourStore } from '@/lib/store/useSectionTourStore';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';

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
          className="flex items-start gap-2.5 text-sm"
          style={{ color: 'var(--dome-text-secondary, var(--secondary-text))' }}
        >
          <span
            className="shrink-0 inline-flex items-center justify-center rounded-full tabular-nums"
            style={{
              width: 20,
              height: 20,
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--dome-accent, var(--accent))',
              color: 'var(--dome-accent-fg, white)',
            }}
          >
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
    <DomeModal
      open={open}
      onClose={onClose}
      title={t(guide.titleKey)}
      size="sm"
      headerIcon={<Sparkles className="size-4 shrink-0" style={{ color: 'var(--dome-accent, var(--accent))' }} />}
      footer={
        <DomeButton type="button" variant="primary" size="sm" onClick={handleGotIt}>
          {t('sectionGuide.got_it')}
        </DomeButton>
      }
    >
      <SectionGuideSteps sectionKey={sectionKey} />
    </DomeModal>
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('sectionGuide.help_aria')}
        title={t('sectionGuide.help_aria')}
        className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors ${className ?? ''}`}
        style={{
          width: 26,
          height: 26,
          color: 'var(--dome-text-muted, var(--tertiary-text))',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--dome-bg-hover, var(--bg-hover))';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text, var(--primary-text))';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--dome-text-muted, var(--tertiary-text))';
        }}
      >
        <HelpCircle className="size-4" />
      </button>
      <SectionGuideModal sectionKey={sectionKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** @deprecated Use `SectionGuideHelp` */
export const SectionHelpButton = SectionGuideHelp;
