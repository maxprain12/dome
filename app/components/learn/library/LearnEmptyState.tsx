import { Sparkles, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
      showToast('error', t('learn.generate_need_project', 'Select or open a project with documents first.'));
      return;
    }
    if (!window.electron?.selectFile || !window.electron?.resource?.import) {
      showToast('error', t('errors.database_unavailable', 'Database not available'));
      return;
    }
    const paths = await window.electron.selectFile({
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['openFile'],
    });
    const filePath = paths?.[0];
    if (!filePath) return;
    const result = await window.electron.resource.import(filePath, projectId, 'pdf');
    if (result.success) {
      showToast('success', t('learn.pdf_imported', 'PDF imported'));
      const resourceId =
        (result.data as { id?: string } | undefined)?.id ??
        (result.data as { resource?: { id?: string } } | undefined)?.resource?.id;
      openGenerateWizard({
        step: 1,
        type: 'flashcards',
        sourceIds: resourceId ? [resourceId] : [],
      });
    } else {
      showToast('error', result.error ?? t('learn.import_failed', 'Import failed'));
    }
  };

  return (
    <div className="lr-empty">
      <div className="lr-empty-art">
        <Sparkles size={36} aria-hidden />
      </div>
      <h2>{t('learn.empty_title', 'Start building your study library')}</h2>
      <p>
        {t(
          'learn.empty_sub',
          'Generate from your notes or import a PDF to create flashcards and other study content.',
        )}
      </p>
      <div className="lr-empty-prompts">
        <button type="button" className="lr-empty-prompt" onClick={() => openGenerateWizard()}>
          <span className="lr-empty-prompt-icon">
            <Sparkles size={14} aria-hidden />
          </span>
          <span className="lr-empty-prompt-title">
            {t('learn.empty_generate_title', 'Generate from note')}
          </span>
          <span className="lr-empty-prompt-sub">
            {t('learn.empty_generate_sub', 'Mind maps, quizzes, guides, and more from your sources.')}
          </span>
        </button>
        <button type="button" className="lr-empty-prompt" onClick={() => void handleUploadPdf()}>
          <span className="lr-empty-prompt-icon">
            <Upload size={14} aria-hidden />
          </span>
          <span className="lr-empty-prompt-title">{t('learn.empty_upload_title', 'Upload PDF')}</span>
          <span className="lr-empty-prompt-sub">
            {t('learn.empty_upload_sub', 'Import a document, then generate study content from it.')}
          </span>
        </button>
      </div>
    </div>
  );
}
