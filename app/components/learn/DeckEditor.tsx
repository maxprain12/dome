import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import type { FlashcardDeck } from '@/types';

interface DeckEditorProps {
  onClose: () => void;
}

interface EditableCard {
  id?: string;
  question: string;
  answer: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isNew?: boolean;
}

export default function DeckEditor({ onClose }: DeckEditorProps) {
  const { t } = useTranslation();
  const { editingDeckId, loadDecks } = useLearnStore();
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadDeckData = async () => {
      if (!editingDeckId) return;

      try {
        const deckResult = await window.electron.db.flashcards.getDeck(editingDeckId);
        if (deckResult.success && deckResult.data) {
          setDeck(deckResult.data);
        }

        const cardsResult = await window.electron.db.flashcards.getCards(editingDeckId);
        if (cardsResult.success && cardsResult.data) {
          setCards(cardsResult.data.map(c => ({
            id: c.id,
            question: c.question,
            answer: c.answer,
            difficulty: c.difficulty,
          })));
        }
      } catch (error) {
        console.error('Error loading deck:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDeckData();
  }, [editingDeckId]);

  const handleAddCard = () => {
    setCards([...cards, { question: '', answer: '', difficulty: 'medium', isNew: true }]);
  };

  const handleRemoveCard = async (index: number) => {
    const card = cards[index];
    if (!card) return;
    if (card.id && !card.isNew) {
      if (confirm(t('common.confirm'))) {
        await window.electron.db.flashcards.deleteCard(card.id);
      } else {
        return;
      }
    }
    setCards(cards.filter((_, i) => i !== index));
  };

  const handleCardChange = (index: number, field: keyof EditableCard, value: string) => {
    setCards(cards.map((card, i) => i === index ? { ...card, [field]: value } : card));
  };

  const handleSave = async () => {
    if (!deck) return;

    setIsSaving(true);
    try {
      // Update deck
      await window.electron.db.flashcards.updateDeck({
        id: deck.id,
        title: deck.title,
        description: deck.description,
      });

      // Save cards
      const newCards = cards.filter(c => c.isNew);
      if (newCards.length > 0) {
        await window.electron.db.flashcards.createCards(deck.id, newCards.map(c => ({
          deck_id: deck.id,
          question: c.question,
          answer: c.answer,
          difficulty: c.difficulty,
        })));
      }

      await loadDecks();
      onClose();
    } catch (error) {
      console.error('Error saving deck:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (isLoading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-4 z-50"
        style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      >
        <Loader2 className="animate-spin" size={32} style={{ color: 'var(--dome-accent)' }} />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b shrink-0" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            {t('common.edit')} Deck
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {deck && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
                Título
              </label>
              <input
                type="text"
                value={deck.title}
                onChange={(e) => setDeck({ ...deck, title: e.target.value })}
                className="w-full px-4 py-3 rounded-lg text-sm transition-all"
                style={{
                  background: 'var(--dome-bg)',
                  border: '1px solid var(--dome-border)',
                  color: 'var(--dome-text)',
                }}
              />
            </div>
          )}

          {deck && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
                Descripción
              </label>

              <textarea
                value={deck.description || ''}
                onChange={(e) => setDeck({ ...deck, description: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 rounded-lg text-sm resize-none transition-all"
                style={{
                  background: 'var(--dome-bg)',
                  border: '1px solid var(--dome-border)',
                  color: 'var(--dome-text)',
                }}
              />
            </div>
          )}

          <div className="border-t pt-4" style={{ borderColor: 'var(--dome-border)' }}>
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--dome-text)' }}>
              Tarjetas ({cards.length})
            </h3>

            <div className="space-y-3">
              {cards.map((card, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg border"
                  style={{ background: 'var(--dome-bg)', borderColor: 'var(--dome-border)' }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                          Pregunta
                        </label>
                        <input
                          type="text"
                          value={card.question}
                          onChange={(e) => handleCardChange(index, 'question', e.target.value)}
                          placeholder="¿Qué es la mitosis?"
                          className="w-full px-3 py-2 rounded-lg text-sm"
                          style={{
                            background: 'var(--dome-surface)',
                            border: '1px solid var(--dome-border)',
                            color: 'var(--dome-text)',
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--dome-text-muted)' }}>
                          Respuesta
                        </label>
                        <input
                          type="text"
                          value={card.answer}
                          onChange={(e) => handleCardChange(index, 'answer', e.target.value)}
                          placeholder="Proceso de división celular..."
                          className="w-full px-3 py-2 rounded-lg text-sm"
                          style={{
                            background: 'var(--dome-surface)',
                            border: '1px solid var(--dome-border)',
                            color: 'var(--dome-text)',
                          }}
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveCard(index)}
                      className="p-2 rounded-lg transition-colors shrink-0"
                      style={{ color: 'var(--error)', background: 'var(--error-bg)' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={handleAddCard}
                className="w-full p-3 rounded-lg border border-dashed flex items-center justify-center gap-2 text-sm transition-all"
                style={{
                  borderColor: 'var(--dome-border)',
                  color: 'var(--dome-text-muted)',
                }}
              >
                <Plus size={16} />
                Agregar tarjeta
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t shrink-0" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: 'var(--dome-accent)',
              color: 'white',
            }}
          >
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
