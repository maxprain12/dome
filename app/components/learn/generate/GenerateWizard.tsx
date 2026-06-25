import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  });

  const handleRetry = () => {
    setProgress(null);
    useLearnStore.getState().setWizardShowProgress(false);
  };

  return (
    <div className="lr-scrim" role="presentation">
      <div className="lr-modal lg" role="dialog" aria-modal="true" aria-labelledby="generate-wizard-title">
        <div className="lr-modal-hd">
          <div className="lr-modal-hd-text">
            <h2 id="generate-wizard-title">{t('learn.generate_title', 'Generate content')}</h2>
            <p>{wizardHint}</p>
            {!showProgress ? <WizardStepper step={wizard.step} /> : null}
          </div>
          <button type="button" className="lr-modal-hd-x" onClick={handleClose} disabled={isGenerating} aria-label={t('ui.close', 'Close')}>
            <X size={16} />
          </button>
        </div>

        <div className="lr-modal-body">
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
          <div className="lr-modal-ft">
            <div className="lr-modal-ft-left">
              {wizard.step === 1
                ? t('learn.source_selected_count', '{{count}} selected', { count: wizard.sourceIds.length })
                : null}
            </div>
            <div className="lr-modal-ft-right">
              <button type="button" className="lr-btn" onClick={handleBack}>
                {wizard.step === 0 ? t('learn.cancel', 'Cancel') : t('learn.back', 'Back')}
              </button>
              <button
                type="button"
                className="lr-btn lr-btn-primary"
                disabled={
                  (wizard.step === 0 && !wizard.type) ||
                  (wizard.step === 1 && wizard.sourceIds.length === 0) ||
                  isGenerating ||
                  (wizard.step === 2 && showProgress)
                }
                onClick={() => void handleNext()}
              >
                {wizard.step === 2 ? t('learn.generate_btn', 'Generate') : t('learn.next', 'Next')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
