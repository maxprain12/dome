import { useState } from 'react';
import { X, Wand2, Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Headphones, Loader2 } from 'lucide-react';
import type { StudioOutputType } from '@/types';

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

const outputTypes: OutputTypeOption[] = [
  { type: 'mindmap', label: 'Mind Map', description: 'Mapa de conceptos', icon: <Map size={24} /> },
  { type: 'flashcards', label: 'Flashcards', description: 'Spaced repetition', icon: <Brain size={24} /> },
  { type: 'quiz', label: 'Quiz', description: 'Preguntas tipo test', icon: <HelpCircle size={24} /> },
  { type: 'guide', label: 'Guía', description: 'Guía estructurada', icon: <BookOpen size={24} /> },
  { type: 'faq', label: 'FAQ', description: 'Preguntas y respuestas', icon: <MessageCircleQuestion size={24} /> },
  { type: 'timeline', label: 'Línea de tiempo', description: 'Eventos cronológicos', icon: <CalendarRange size={24} /> },
  { type: 'table', label: 'Tabla', description: 'Datos estructurados', icon: <Table2 size={24} /> },
  { type: 'audio', label: 'Audio', description: 'Resumen en audio', icon: <Headphones size={24} />, comingSoon: true },
];

export default function GenerateModal({ onClose }: GenerateModalProps) {
  const [selectedType, setSelectedType] = useState<StudioOutputType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
            Generar contenido
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
            Selecciona el tipo de contenido que quieres generar
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
                    Pronto
                  </span>
                )}
              </button>
            ))}
          </div>

          {selectedType && (
            <div className="p-4 rounded-lg mb-4" style={{ background: 'var(--dome-bg)', border: '1px solid var(--dome-border)' }}>
              <p className="text-sm" style={{ color: 'var(--dome-text-muted)' }}>
                Se generará un <strong style={{ color: 'var(--dome-text)' }}>{outputTypes.find(o => o.type === selectedType)?.label}</strong> basado en los recursos de tu proyecto.
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
            Cancelar
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
            Generar
          </button>
        </div>
      </div>
    </div>
  );
}
