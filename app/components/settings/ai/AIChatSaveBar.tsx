import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { TestResult } from './aiSectionHelpers';

export interface AIChatSaveBarProps {
  showTest: boolean;
  saved: boolean;
  testing: boolean;
  testResult: TestResult | null;
  onSave: () => void;
  onTest: () => void;
}

/** Save / test-connection footer for chat and transcription tabs. */
export default function AIChatSaveBar({
  showTest,
  saved,
  testing,
  testResult,
  onSave,
  onTest,
}: AIChatSaveBarProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => {
            onSave();
          }}
        >
          {saved ? t('settings.ai.saved_config') : t('settings.ai.save_all')}
        </Button>
        {showTest ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onTest();
            }}
            disabled={testing}
          >
            {testing ? <Spinner data-icon="inline-start" /> : null}
            {t('settings.ai.test_connection')}
          </Button>
        ) : null}
      </div>
      {testResult && showTest ? (
        <Alert variant={testResult.success ? 'default' : 'destructive'} role="note">
          <HugeiconsIcon
            icon={testResult.success ? CheckmarkCircle02Icon : AlertCircleIcon}
            aria-hidden
          />
          <AlertDescription className="text-xs">{testResult.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}
