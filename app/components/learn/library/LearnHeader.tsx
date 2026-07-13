import { MagicWand01Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { useLearnStore } from '@/lib/store/useLearnStore';

export default function LearnHeader() {
  const { t } = useTranslation();
  const openGenerateWizard = useLearnStore((s) => s.openGenerateWizard);
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <PageHeader
      eyebrow={dateLine}
      title={<span className="inline-flex items-center gap-2">{t('learn.page_title', 'Learn')}<SectionGuideHelp sectionKey="learn" /></span>}
      description={t('learn.page_subtitle', 'Flashcards, guides, mind maps, and AI-generated study content.')}
      actions={<>
        <Button type="button" variant="outline" onClick={() => openGenerateWizard({ step: 2 })}>
          <HugeiconsIcon icon={SlidersHorizontalIcon} data-icon="inline-start" />
          {t('learn.defaults', 'Defaults')}
        </Button>
        <Button type="button" onClick={() => openGenerateWizard()}>
          <HugeiconsIcon icon={MagicWand01Icon} data-icon="inline-start" />
          {t('learn.generate', 'Generate')}
        </Button>
      </>}
    />
  );
}
