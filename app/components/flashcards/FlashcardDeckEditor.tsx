
import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Plus, Save, Loader2 } from 'lucide-react';
import { useFlashcardStore } from '@/lib/store/useFlashcardStore';
import FlashcardCardEditor from './FlashcardCardEditor';
import type { Flashcard } from '@/types';

interface FlashcardDeckEditorProps {
  deckId: string;
  onClose: () => void;
}

export default function FlashcardDeckEditor({ deckId, onClose }: FlashcardDeckEditorProps) {
  const { currentDeck, currentCards, loadDeck } = useFlashcardStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadDeck(deckId);
      setIsLoading(false);
    };
    load();
  }, [deckId, loadDeck]);

  // Sync local state from store
  useEffect(() => {
    if (currentDeck) {
      setTitle(currentDeck.title);
      setDescription(currentDeck.description || '');
    }
  }, [currentDeck]);

  useEffect(() => {
    setCards(currentCards);
  }, [currentCards]);

  const handleSaveDeck = useCallback(async () => {
    if (!currentDeck) return;
    setIsSaving(true);
    try {
      await window.electron.db.flashcards.updateDeck({
        id: currentDeck.id,
        title,
        description: description || undefined,
      });
    } catch (error) {
      console.error('[FlashcardDeckEditor] Error saving deck:', error);
    }
    setIsSaving(false);
  }, [currentDeck, title, description]);

  const handleUpdateCard = useCallback(async (
    cardId: string,
    updates: { question?: string; answer?: string; difficulty?: 'easy' | 'medium' | 'hard' }
  ) => {
    try {
      await window.electron.db.flashcards.updateCard({ id: cardId, ...updates });
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, ...updates, updated_at: Date.now() } : c))
      );
    } catch (error) {
      console.error('[FlashcardDeckEditor] Error updating card:', error);
    }
  }, []);

  const handleDeleteCard = useCallback(async (cardId: string) => {
    try {
      await window.electron.db.flashcards.deleteCard(cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (error) {
      console.error('[FlashcardDeckEditor] Error deleting card:', error);
    }
  }, []);

  const handleAddCard = useCallback(async () => {
    if (!currentDeck) return;
    try {
      const result = await window.electron.db.flashcards.createCard({
        deck_id: currentDeck.id,
        question: '',
        answer: '',
        difficulty: 'medium',
      });
      if (result.success && result.data) {
        setCards((prev) => [...prev, result.data]);
      }
    } catch (error) {
      console.error('[FlashcardDeckEditor] Error creating card:', error);
    }
  }, [currentDeck]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="btn btn-ghost p-2 rounded-lg"
            aria-label="Volver"
          >
            <ArrowLeft className="w-5 h-5" style={{ color: 'var(--secondary-text)' }} />
          </button>
          <h2
            className="text-xl font-semibold"
            style={{ color: 'var(--primary-text)' }}
          >
            Editar mazo
          </h2>
        </div>
        <button
          onClick={handleSaveDeck}
          disabled={isSaving}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Guardar
        </button>
      </div>

      {/* Deck info */}
      <div
        className="rounded-xl p-5 mb-6"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="space-y-4">
          <div>
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: 'var(--secondary-text)' }}
            >
              Titulo del mazo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleSaveDeck}
              className="input"
              placeholder="Nombre del mazo..."
            />
          </div>
          <div>
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: 'var(--secondary-text)' }}
            >
              Descripcion (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleSaveDeck}
              className="input resize-none"
              rows={2}
              placeholder="Descripcion del mazo..."
            />
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className="text-sm font-semibold"
          style={{ color: 'var(--primary-text)' }}
        >
          Tarjetas ({cards.length})
        </h3>
        <button
          onClick={handleAddCard}
          className="btn btn-ghost flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--accent)' }}
        >
          <Plus className="w-4 h-4" />
          Agregar tarjeta
        </button>
      </div>

      {cards.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--border)',
          }}
        >
          <p className="text-sm mb-3" style={{ color: 'var(--secondary-text)' }}>
            Este mazo no tiene tarjetas aun
          </p>
          <button
            onClick={handleAddCard}
            className="btn btn-primary text-sm inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar primera tarjeta
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card, index) => (
            <FlashcardCardEditor
              key={card.id}
              card={card}
              index={index}
              onUpdate={handleUpdateCard}
              onDelete={handleDeleteCard}
            />
          ))}
        </div>
      )}

      {/* Add card button at bottom */}
      {cards.length > 0 && (
        <button
          onClick={handleAddCard}
          className="w-full mt-4 py-3 rounded-xl border-2 border-dashed transition-all duration-200 text-sm font-medium hover:border-[var(--accent)]"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--tertiary-text)',
            background: 'transparent',
          }}
        >
          <Plus className="w-4 h-4 inline-block mr-1.5" />
          Agregar otra tarjeta
        </button>
      )}
    </div>
  );
}
