import { Settings2, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/store/useLearnStore';

export default function LearnHeader() {
  const { t } = useTranslation();
  const openGenerateWizard = useLearnStore((s) => s.openGenerateWizard);

  const dateLine = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="lr-hd">
      <div className="lr-hd-date">{dateLine}</div>
      <div className="lr-hd-row">
        <div>
          <h1 className="lr-hd-title">{t('learn.page_title', 'Learn')}</h1>
          <p className="lr-hd-sub">
            {t('learn.page_subtitle', 'Flashcards, guides, mind maps, and AI-generated study content.')}
          </p>
        </div>
        <div className="lr-hd-actions">
          <button
            type="button"
            className="lr-btn lr-btn-ghost"
            onClick={() => openGenerateWizard({ step: 2 })}
          >
            <Settings2 size={14} aria-hidden />
            {t('learn.defaults', 'Defaults')}
          </button>
          <button type="button" className="lr-btn lr-btn-primary" onClick={() => openGenerateWizard()}>
            <Wand2 size={14} aria-hidden />
            {t('learn.generate', 'Generate')}
          </button>
        </div>
      </div>
    </header>
  );
}
