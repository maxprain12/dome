import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerateStream } from '@/lib/hooks/useStudioGenerateStream';
import { showToast } from '@/lib/store/useToastStore';
import WizardStepper from './WizardStepper';
import StepTypePicker from './StepTypePicker';
import StepSourcePicker from './StepSourcePicker';
import StepConfigure from './StepConfigure';
import GenerateProgressView from './GenerateProgressView';

interface GenerateWizardProps {
  onClose: () => void;
}

export default function GenerateWizard({ onClose }: GenerateWizardProps) {
  const { t } = useTranslation();
  const projectId = useAppStore((s) => s.currentProject?.id ?? null);

  const wizard = useLearnStore((s) => s.wizard);
  const progress = useLearnStore((s) => s.progress);
  const setWizardStep = useLearnStore((s) => s.setWizardStep);
  const setWizardType = useLearnStore((s) => s.setWizardType);
  const setWizardSourceIds = useLearnStore((s) => s.setWizardSourceIds);
  const setWizardConfig = useLearnStore((s) => s.setWizardConfig);
  const resetWizard = useLearnStore((s) => s.resetWizard);
  const setProgress = useLearnStore((s) => s.setProgress);

  const { generate, isGenerating } = useStudioGenerateStream({ projectId });

  const showProgress = wizard.showProgress || isGenerating;

  const wizardHint = showProgress
    ? t('learn.generate_progress_hint', 'Generating your content…')
    : wizard.step === 0
      ? t('learn.generate_hint_type', 'Choose the type of content you want to generate')
      : wizard.step === 1
        ? t('learn.generate_hint_sources', 'Select the sources to use for generation')
        : t('learn.generate_hint_config', 'Configure title, difficulty, and instructions');

  const handleClose = () => {
    if (isGenerating) return;
    resetWizard();
    onClose();
  };

  const handleBack = () => {
    if (wizard.step === 0) handleClose();
    else setWizardStep((wizard.step - 1) as 0 | 1 | 2);
  };

  const handleNext = async () => {
    if (wizard.step === 0) {
      if (!wizard.type) return;
      if (!projectId) {
        showToast('error', t('learn.generate_need_project', 'Select or open a project with documents first.'));
        return;
      }
      setWizardStep(1);
      return;
    }

    if (wizard.step === 1) {
      if (wizard.sourceIds.length === 0) {
        showToast('error', t('learn.source_required', 'Select at least one source.'));
        return;
      }
      setWizardStep(2);
      return;
    }

    if (!wizard.type) return;
    const resourceId = wizard.sourceIds[0] ?? null;
    const ok = await generate(wizard.type, wizard.sourceIds, resourceId, wizard.config);
    if (ok) {
      resetWizard();
      onClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) handleClose();
      if (e.key === 'Enter' && !isGenerating && !showProgress) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        void handleNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, handleNext, isGenerating, showProgress]);

  const handleRetry = () => {
    setProgress(null);
    useLearnStore.getState().setWizardShowProgress(false);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isGenerating) handleClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden">
        <DialogHeader>
            <DialogTitle>{t('learn.generate_title', 'Generate content')}</DialogTitle>
            <DialogDescription>{wizardHint}</DialogDescription>
            {!showProgress ? <WizardStepper step={wizard.step} /> : null}
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {showProgress ? (
            <GenerateProgressView progress={progress} onRetry={handleRetry} />
          ) : wizard.step === 0 ? (
            <StepTypePicker selected={wizard.type} onSelect={setWizardType} />
          ) : wizard.step === 1 ? (
            <StepSourcePicker
              projectId={projectId}
              selectedIds={wizard.sourceIds}
              onChange={setWizardSourceIds}
            />
          ) : (
            <StepConfigure config={wizard.config} onChange={setWizardConfig} />
          )}
        </div>

        {!showProgress ? (
          <DialogFooter className="items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {wizard.step === 1
                ? t('learn.source_selected_count', '{{count}} selected', { count: wizard.sourceIds.length })
                : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleBack}>
                {wizard.step === 0 ? t('learn.cancel', 'Cancel') : t('learn.back', 'Back')}
              </Button>
              <Button
                type="button"
                disabled={
                  (wizard.step === 0 && !wizard.type) ||
                  (wizard.step === 1 && wizard.sourceIds.length === 0) ||
                  isGenerating ||
                  (wizard.step === 2 && showProgress)
                }
                onClick={() => void handleNext()}
              >
                {isGenerating ? <Spinner data-icon="inline-start" /> : null}{wizard.step === 2 ? t('learn.generate_btn', 'Generate') : t('learn.next', 'Next')}
              </Button>
            </div>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
