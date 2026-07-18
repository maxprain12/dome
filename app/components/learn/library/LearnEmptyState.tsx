import { SparklesIcon, Upload04Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';

export default function LearnEmptyState() {
  const { t } = useTranslation();
  const openGenerateWizard = useLearnStore((s) => s.openGenerateWizard);
  const currentProject = useAppStore((s) => s.currentProject);

  const handleUploadPdf = async () => {
    const projectId = currentProject?.id;
    if (!projectId) {
      return showToast(
        'error',
        t('learn.generate_need_project', 'Select or open a project with documents first.'),
      );
    }
    if (!window.electron?.selectFile || !window.electron?.resource?.import) {
      return showToast('error', t('errors.database_unavailable', 'Database not available'));
    }
    const paths = await window.electron.selectFile({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });
    if (!paths?.[0]) return;
    const result = await window.electron.resource.import(paths[0], projectId, 'pdf');
    if (!result.success) {
      return showToast('error', result.error ?? t('learn.import_failed', 'Import failed'));
    }
    showToast('success', t('learn.pdf_imported', 'PDF imported'));
    const resourceId =
      (result.data as { id?: string } | undefined)?.id ??
      (result.data as { resource?: { id?: string } } | undefined)?.resource?.id;
    openGenerateWizard({
      step: 1,
      type: 'flashcards',
      sourceIds: resourceId ? [resourceId] : [],
    });
  };

  return (
    <Empty className="flex-none py-10 @[36rem]/learn:py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={SparklesIcon} />
        </EmptyMedia>
        <EmptyTitle>{t('learn.empty_title', 'Start building your study library')}</EmptyTitle>
        <EmptyDescription>
          {t(
            'learn.empty_sub',
            'Generate from your notes or import a PDF to create flashcards and other study content.',
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        <Button type="button" onClick={() => openGenerateWizard()}>
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
          {t('learn.empty_generate_title', 'Generate from note')}
        </Button>
        <Button type="button" variant="outline" onClick={() => void handleUploadPdf()}>
          <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />
          {t('learn.empty_upload_title', 'Upload PDF')}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
