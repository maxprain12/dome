'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, Wand2, Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Headphones, Loader2 } from 'lucide-react';
import type { StudioOutputType } from '@/types';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/lib/store/useAppStore';
import { useStudioGenerate } from '@/lib/hooks/useStudioGenerate';
import GenerateSourceModal from '@/components/studio/GenerateSourceModal';
import { showToast } from '@/lib/store/useToastStore';

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
  const currentProject = useAppStore((s) => s.currentProject);
  const projectId = currentProject?.id ?? null;

  const { generate, isGenerating } = useStudioGenerate({
    projectId,
  });

  const [selectedType, setSelectedType] = useState<StudioOutputType | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);

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
    [t],
  );

  const selectedLabel = outputTypes.find((o) => o.type === selectedType)?.label;

  const openSourcePicker = useCallback(() => {
    if (!selectedType) return;
    if (!projectId) {
      showToast('error', t('learn.generate_need_project'));
      return;
    }
    setSourceModalOpen(true);
  }, [selectedType, projectId, t]);

  const handleSourceConfirm = useCallback(
    (sourceIds: string[]) => {
      if (!selectedType || sourceIds.length === 0) return;
      void (async () => {
        setSourceModalOpen(false);
        const primaryResourceId = sourceIds[0] ?? null;
        const ok = await generate(selectedType, sourceIds, primaryResourceId);
        if (ok) onClose();
      })();
    },
    [selectedType, generate, onClose],
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isGenerating) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
      role="presentation"
    >
      <GenerateSourceModal
        isOpen={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
        onConfirm={handleSourceConfirm}
        projectId={projectId}
        tileTitle={selectedLabel ?? ''}
        requireAtLeastOne
        titleOverride={
          selectedLabel
            ? t('learn.source_modal_title', { type: selectedLabel })
            : undefined
        }
        descriptionOverride={t('learn.source_modal_required_hint')}
      />

      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isGenerating ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--dome-surface) 88%, transparent)' }}
            role="status"
            aria-live="polite"
          >
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--dome-accent)' }} aria-hidden />
            <p className="text-sm font-medium px-6 text-center" style={{ color: 'var(--dome-text)' }}>
              {t('learn.generating')}
            </p>
          </div>
        ) : null}
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('learn.generate_title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 rounded-lg transition-colors disabled:opacity-50"
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
                type="button"
                onClick={() => !option.comingSoon && !isGenerating && setSelectedType(option.type)}
                disabled={option.comingSoon || isGenerating}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border transition-all text-center"
                style={{
                  background: selectedType === option.type ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
                  borderColor: selectedType === option.type ? 'var(--dome-accent)' : 'var(--dome-border)',
                  color: selectedType === option.type ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
                  opacity: option.comingSoon ? 0.5 : 1,
                  cursor: option.comingSoon || isGenerating ? 'not-allowed' : 'pointer',
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
                {t('learn.generate_preview_doc', { type: selectedLabel })}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
          >
            {t('learn.cancel')}
          </button>
          <button
            type="button"
            onClick={openSourcePicker}
            disabled={!selectedType || isGenerating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: selectedType ? 'var(--dome-accent)' : 'var(--dome-border)',
              color: selectedType ? 'var(--base-text)' : 'var(--dome-text-muted)',
              cursor: selectedType && !isGenerating ? 'pointer' : 'not-allowed',
            }}
          >
            {isGenerating && <Loader2 size={16} className="animate-spin" />}
            <Wand2 size={16} />
            {isGenerating ? t('learn.generating') : t('learn.generate_next_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
