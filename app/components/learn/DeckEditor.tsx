import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, Trash2, Loader2 } from 'lucide-react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { showToast } from '@/lib/store/useToastStore';
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
  const { editingDeckId, loadDecks, loadDeckStats } = useLearnStore();
  const [deck, setDeck] = useState<FlashcardDeck | null>(null);
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadDeckData = async () => {
      if (!editingDeckId) return;
      try {
        const deckResult = await window.electron.db.flashcards.getDeck(editingDeckId);
        if (deckResult.success && deckResult.data) setDeck(deckResult.data);

        const cardsResult = await window.electron.db.flashcards.getCards(editingDeckId);
        if (cardsResult.success && cardsResult.data) {
          setCards(
            cardsResult.data.map((c) => ({
              id: c.id,
              question: c.question,
              answer: c.answer,
              difficulty: c.difficulty,
            })),
          );
        }
      } catch (error) {
        console.error('Error loading deck:', error);
        showToast('error', t('flashcard.load_failed', 'Could not load the deck.'));
      } finally {
        setIsLoading(false);
      }
    };
    void loadDeckData();
  }, [editingDeckId, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSaving, onClose]);

  const handleAddCard = () => {
    setCards((prev) => [...prev, { question: '', answer: '', difficulty: 'medium', isNew: true }]);
  };

  const handleRemoveCard = async (index: number) => {
    const card = cards[index];
    if (!card) return;
    if (card.id && !card.isNew) {
      if (!confirm(t('flashcard.delete_card_confirm', 'Delete this card?'))) return;
      try {
        await window.electron.db.flashcards.deleteCard(card.id);
      } catch (error) {
        console.error('Error deleting card:', error);
        showToast('error', t('flashcard.delete_failed', 'Could not delete the card.'));
        return;
      }
    }
    setCards((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCardChange = (index: number, field: keyof EditableCard, value: string) => {
    setCards((prev) => prev.map((card, i) => (i === index ? { ...card, [field]: value } : card)));
  };

  const handleSave = useCallback(async () => {
    if (!deck) return;

    const title = deck.title.trim();
    if (!title) {
      showToast('error', t('flashcard.title_required', 'The deck needs a title.'));
      return;
    }
    // Validate every card has both sides filled in
    const cleaned = cards.map((c) => ({ ...c, question: c.question.trim(), answer: c.answer.trim() }));
    const invalid = cleaned.some((c) => !c.question || !c.answer);
    if (invalid) {
      showToast('error', t('flashcard.cards_incomplete', 'Every card needs a question and an answer.'));
      return;
    }

    setIsSaving(true);
    try {
      await window.electron.db.flashcards.updateDeck({
        id: deck.id,
        title,
        description: deck.description?.trim() || null,
      });

      // Persist edits to existing cards (this was previously dropped)
      const existing = cleaned.filter((c) => c.id && !c.isNew);
      await Promise.all(
        existing.map((c) =>
          window.electron.db.flashcards.updateCard({
            id: c.id,
            question: c.question,
            answer: c.answer,
            difficulty: c.difficulty,
          }),
        ),
      );

      // Create new cards
      const newCards = cleaned.filter((c) => c.isNew);
      if (newCards.length > 0) {
        await window.electron.db.flashcards.createCards(
          deck.id,
          newCards.map((c) => ({
            deck_id: deck.id,
            question: c.question,
            answer: c.answer,
            difficulty: c.difficulty,
          })),
        );
      }

      await loadDecks();
      void loadDeckStats(deck.id);
      showToast('success', t('flashcard.deck_saved', 'Deck saved.'));
      onClose();
    } catch (error) {
      console.error('Error saving deck:', error);
      showToast('error', t('flashcard.save_failed', 'Could not save the deck.'));
    } finally {
      setIsSaving(false);
    }
  }, [deck, cards, loadDecks, loadDeckStats, onClose, t]);

  if (isLoading) {
    return (
      <div className="lr-scrim" role="presentation">
        <div className="lr-modal" role="dialog" aria-modal="true" aria-busy="true">
          <div className="lr-modal-body" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 className="lr-spin" size={28} aria-label={t('ui.loading', 'Loading')} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lr-scrim" role="presentation">
      <div className="lr-modal lg" role="dialog" aria-modal="true" aria-labelledby="deck-editor-heading">
        <div className="lr-modal-hd">
          <div className="lr-modal-hd-text">
            <h2 id="deck-editor-heading">{t('flashcard.edit_deck', 'Edit deck')}</h2>
            <p>{t('flashcard.edit_deck_hint', 'Update the title, description and cards.')}</p>
          </div>
          <button type="button" className="lr-modal-hd-x" onClick={onClose} aria-label={t('ui.close', 'Close')}>
            <X size={16} />
          </button>
        </div>

        <div className="lr-modal-body">
          {deck && (
            <>
              <div className="lr-field">
                <label className="lr-field-label" htmlFor="deck-editor-title">
                  {t('flashcard.deck_title', 'Title')}
                </label>
                <input
                  id="deck-editor-title"
                  type="text"
                  className="lr-input"
                  value={deck.title}
                  onChange={(e) => setDeck({ ...deck, title: e.target.value })}
                  placeholder={t('flashcard.deck_title_placeholder', 'e.g. Cell biology')}
                />
              </div>

              <div className="lr-field">
                <label className="lr-field-label" htmlFor="deck-editor-description">
                  {t('flashcard.deck_description', 'Description')}
                </label>
                <textarea
                  id="deck-editor-description"
                  className="lr-textarea"
                  rows={2}
                  value={deck.description || ''}
                  onChange={(e) => setDeck({ ...deck, description: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="lr-deck-edit-cards">
            <h3 className="lr-field-label">
              {t('flashcard.cards', 'Cards')} ({cards.length})
            </h3>

            {cards.map((card, index) => (
              <div key={card.id ?? `new-${index}`} className="lr-deck-edit-card">
                <div className="lr-deck-edit-card-fields">
                  <input
                    type="text"
                    className="lr-input"
                    value={card.question}
                    onChange={(e) => handleCardChange(index, 'question', e.target.value)}
                    placeholder={t('flashcard.question', 'Question')}
                    aria-label={t('flashcard.question', 'Question')}
                  />
                  <input
                    type="text"
                    className="lr-input"
                    value={card.answer}
                    onChange={(e) => handleCardChange(index, 'answer', e.target.value)}
                    placeholder={t('flashcard.answer', 'Answer')}
                    aria-label={t('flashcard.answer', 'Answer')}
                  />
                </div>
                <select
                  className="lr-input lr-deck-edit-difficulty"
                  value={card.difficulty}
                  onChange={(e) => handleCardChange(index, 'difficulty', e.target.value)}
                  aria-label={t('flashcard.difficulty', 'Difficulty')}
                >
                  <option value="easy">{t('flashcard.easy', 'Easy')}</option>
                  <option value="medium">{t('flashcard.medium', 'Medium')}</option>
                  <option value="hard">{t('flashcard.difficult', 'Hard')}</option>
                </select>
                <button
                  type="button"
                  className="lr-btn lr-btn-ghost lr-deck-edit-remove"
                  onClick={() => void handleRemoveCard(index)}
                  aria-label={t('flashcard.delete_card', 'Delete card')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <button type="button" className="lr-deck-edit-add" onClick={handleAddCard}>
              <Plus size={15} />
              {t('flashcard.add_card', 'Add card')}
            </button>
          </div>
        </div>

        <div className="lr-modal-ft">
          <div className="lr-modal-ft-left" />
          <div className="lr-modal-ft-right">
            <button type="button" className="lr-btn" onClick={onClose} disabled={isSaving}>
              {t('learn.cancel', 'Cancel')}
            </button>
            <button type="button" className="lr-btn lr-btn-primary" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving && <Loader2 size={15} className="lr-spin" />}
              {t('flashcard.save_changes', 'Save changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
