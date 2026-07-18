import { MagicWand01Icon, SlidersHorizontalIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { SectionGuideHelp } from '@/components/onboarding/SectionOnboardingCard';
import { HubHeader } from '@/components/hub/HubHeader';
import { Button } from '@/components/ui/button';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { askStudioMany } from '@/components/studio-hub';

export default function LearnHeader() {
  const { t } = useTranslation();
  const openGenerateWizard = useLearnStore((s) => s.openGenerateWizard);
  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const defaultsLabel = t('learn.defaults', 'Defaults');
  const generateLabel = t('learn.generate', 'Generate');
  const askManyLabel = t('learn.agent_ask_many', 'Ask Many');

  return (
    <HubHeader
      title={t('learn.page_title', 'Learn')}
      description={`${dateLine} · ${t('learn.page_subtitle', 'Flashcards, guides, mind maps, and AI-generated study content.')}`}
      actions={
        <>
          <SectionGuideHelp sectionKey="learn" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openGenerateWizard({ step: 2 })}
            title={defaultsLabel}
            aria-label={defaultsLabel}
          >
            <HugeiconsIcon icon={SlidersHorizontalIcon} data-icon="inline-start" />
            <span className="@[36rem]/learn:inline hidden">{defaultsLabel}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => openGenerateWizard()}
            title={generateLabel}
            aria-label={generateLabel}
          >
            <HugeiconsIcon icon={MagicWand01Icon} data-icon="inline-start" />
            <span className="@[36rem]/learn:inline hidden">{generateLabel}</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => askStudioMany(t('learn.agent_prompt'))}
            title={askManyLabel}
            aria-label={askManyLabel}
          >
            <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
            <span className="@[36rem]/learn:inline hidden">{askManyLabel}</span>
          </Button>
        </>
      }
    />
  );
}
