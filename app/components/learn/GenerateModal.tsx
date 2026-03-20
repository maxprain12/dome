import { useState, useMemo } from 'react';
import { X, Wand2, Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Headphones, Loader2 } from 'lucide-react';
import type { StudioOutputType } from '@/types';
import { useTranslation } from 'react-i18next';

interface GenerateModalProps {
  onClose: () => void;
}

interface OutputTypeOption {
  type: StudioOutputType;
  label: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}

export default function GenerateModal({ onClose }: GenerateModalProps) {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<StudioOutputType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const outputTypes: OutputTypeOption[] = useMemo(
    () => [
      { type: 'mindmap', label: t('learn.type_mindmap'), description: t('learn.type_mindmap_desc'), icon: <Map size={24} /> },
      { type: 'flashcards', label: t('learn.tab_decks'), description: t('learn.type_flashcards_desc'), icon: <Brain size={24} /> },
      { type: 'quiz', label: t('learn.tab_quizzes'), description: t('learn.type_quiz_desc'), icon: <HelpCircle size={24} /> },
      { type: 'guide', label: t('learn.tab_guides'), description: t('learn.type_guide_desc'), icon: <BookOpen size={24} /> },
      { type: 'faq', label: t('learn.tab_faqs'), description: t('learn.type_faq_desc'), icon: <MessageCircleQuestion size={24} /> },
      { type: 'timeline', label: t('learn.tab_timelines'), description: t('learn.type_timeline_desc'), icon: <CalendarRange size={24} /> },
      { type: 'table', label: t('learn.tab_tables'), description: t('learn.type_table_desc'), icon: <Table2 size={24} /> },
      { type: 'audio', label: t('learn.type_audio'), description: t('learn.type_audio_desc'), icon: <Headphones size={24} />, comingSoon: true },
    ],
    [t]
  );

  const handleGenerate = async () => {
    if (!selectedType) return;

    setIsGenerating(true);
    try {
      // TODO: Implement actual generation logic
      console.log('Generating', selectedType);
      await new Promise(resolve => setTimeout(resolve, 1000));
      onClose();
    } catch (error) {
      console.error('Error generating:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const selectedLabel = outputTypes.find((o) => o.type === selectedType)?.label;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('learn.generate_title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm mb-4" style={{ color: 'var(--dome-text-muted)' }}>
            {t('learn.generate_hint')}
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {outputTypes.map((option) => (
              <button
                key={option.type}
                onClick={() => !option.comingSoon && setSelectedType(option.type)}
                disabled={option.comingSoon}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center"
                style={{
                  background: selectedType === option.type ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
                  borderColor: selectedType === option.type ? 'var(--dome-accent)' : 'var(--dome-border)',
                  color: selectedType === option.type ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                  opacity: option.comingSoon ? 0.5 : 1,
                  cursor: option.comingSoon ? 'not-allowed' : 'pointer',
                }}
              >
                <span>{option.icon}</span>
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {option.description}
                </span>
                {option.comingSoon && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--dome-border)' }}>
                    {t('common.coming_soon')}
                  </span>
                )}
              </button>
            ))}
          </div>

          {selectedType && selectedLabel && (
            <div className="p-4 rounded-lg mb-4" style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}>
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                {t('learn.generate_preview', { type: selectedLabel })}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
          >
            {t('learn.cancel')}
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selectedType || isGenerating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: selectedType ? 'var(--dome-accent)' : 'var(--dome-border)',
              color: selectedType ? 'white' : 'var(--dome-text-muted)',
              cursor: selectedType ? 'pointer' : 'not-allowed',
            }}
          >
            {isGenerating && <Loader2 size={16} className="animate-spin" />}
            <Wand2 size={16} />
            {t('learn.generate_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
