import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Add01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { showToast } from '@/lib/store/useToastStore';
import type { FlashcardDeck } from '@/types';

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
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
  const [pendingRemove, setPendingRemove] = useState<number | null>(null);

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
      try {
        await window.electron.db.flashcards.deleteCard(card.id);
      } catch (error) {
        console.error('Error deleting card:', error);
        showToast('error', t('flashcard.delete_failed', 'Could not delete the card.'));
        return;
      }
    }
    setCards((prev) => prev.filter((_, i) => i !== index));
    setPendingRemove(null);
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
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent aria-busy="true"><DialogHeader><DialogTitle>{t('flashcard.edit_deck', 'Edit deck')}</DialogTitle><DialogDescription>{t('ui.loading', 'Loading')}</DialogDescription></DialogHeader><div className="flex justify-center py-12"><Spinner aria-label={t('ui.loading', 'Loading')} /></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] w-full max-w-3xl overflow-hidden sm:max-w-3xl">
        <DialogHeader><DialogTitle>{t('flashcard.edit_deck', 'Edit deck')}</DialogTitle><DialogDescription>{t('flashcard.edit_deck_hint', 'Update the title, description and cards.')}</DialogDescription></DialogHeader>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          {deck && (
            <FieldGroup>
              <Field><FieldLabel htmlFor="deck-editor-title">{t('flashcard.deck_title', 'Title')}</FieldLabel><Input
                  id="deck-editor-title"
                  type="text"
                  value={deck.title}
                  onChange={(e) => setDeck({ ...deck, title: e.target.value })}
                  placeholder={t('flashcard.deck_title_placeholder', 'e.g. Cell biology')}
                /></Field>
              <Field><FieldLabel htmlFor="deck-editor-description">{t('flashcard.deck_description', 'Description')}</FieldLabel><Textarea
                  id="deck-editor-description"
                  rows={2}
                  value={deck.description || ''}
                  onChange={(e) => setDeck({ ...deck, description: e.target.value })}
                /></Field>
            </FieldGroup>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">
              {t('flashcard.cards', 'Cards')} ({cards.length})
            </h3>

            {cards.map((card, index) => (
              <Card key={card.id ?? `new-${index}`} size="sm"><CardHeader><CardTitle>{t('flashcard.card_number', 'Card {{number}}', { number: index + 1 })}</CardTitle><Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setPendingRemove(index)} aria-label={t('flashcard.delete_card', 'Delete card')}><HugeiconsIcon icon={Delete02Icon} /></Button></CardHeader><CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_140px]">
                  <Input
                    type="text"
                    value={card.question}
                    onChange={(e) => handleCardChange(index, 'question', e.target.value)}
                    placeholder={t('flashcard.question', 'Question')}
                    aria-label={t('flashcard.question', 'Question')}
                  />
                  <Input
                    type="text"
                    value={card.answer}
                    onChange={(e) => handleCardChange(index, 'answer', e.target.value)}
                    placeholder={t('flashcard.answer', 'Answer')}
                    aria-label={t('flashcard.answer', 'Answer')}
                  />
                <Select value={card.difficulty ?? null} onValueChange={(next) => { if (next != null) ((v) => handleCardChange(index, 'difficulty', v))(next); }} items={[
                    { value: 'easy', label: t('flashcard.easy', 'Easy') },
                    { value: 'medium', label: t('flashcard.medium', 'Medium') },
                    { value: 'hard', label: t('flashcard.difficult', 'Hard') },
                  ]}><SelectTrigger className="w-full" aria-label={t('flashcard.difficulty', 'Difficulty')}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{([
                    { value: 'easy', label: t('flashcard.easy', 'Easy') },
                    { value: 'medium', label: t('flashcard.medium', 'Medium') },
                    { value: 'hard', label: t('flashcard.difficult', 'Hard') },
                  ]).map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
              </CardContent></Card>
            ))}

            <Button type="button" variant="outline" onClick={handleAddCard}>
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
              {t('flashcard.add_card', 'Add card')}
            </Button>
          </section>
        </div>

        <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              {t('learn.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              {t('flashcard.save_changes', 'Save changes')}
            </Button>
        </DialogFooter>
        <AlertDialog open={pendingRemove != null} onOpenChange={(open) => { if (!open) setPendingRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('flashcard.delete_card_confirm', 'Delete this card?')}</AlertDialogTitle><AlertDialogDescription>{pendingRemove != null ? cards[pendingRemove]?.question : ''}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => pendingRemove != null && void handleRemoveCard(pendingRemove)}>{t('ui.delete', 'Delete')}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
