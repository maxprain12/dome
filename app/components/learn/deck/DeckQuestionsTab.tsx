import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { Flashcard } from '@/types';
import { showToast } from '@/lib/store/useToastStore';

interface DeckQuestionsTabProps {
  cards: Flashcard[];
  quizQuestions?: { id: string; question: string; difficulty?: string }[];
  studioOutputId?: string;
  onRefresh?: () => void;
}

export default function DeckQuestionsTab({
  cards,
  quizQuestions,
  studioOutputId,
  onRefresh,
}: DeckQuestionsTabProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  const items =
    quizQuestions ??
    cards.map((c) => ({ id: c.id, question: c.question, difficulty: c.difficulty, answer: c.answer }));

  const openEdit = (item: (typeof items)[number]) => {
    setEditingId(item.id);
    setDraftQuestion(item.question);
    setDraftAnswer('answer' in item && typeof item.answer === 'string' ? item.answer : '');
  };

  const handleSave = async () => {
    if (!editingId || !draftQuestion.trim()) return;
    setSaving(true);
    try {
      if (quizQuestions && studioOutputId) {
        const getResult = await window.electron.db.studio.getById(studioOutputId);
        if (getResult.success && getResult.data?.content) {
          const content = JSON.parse(getResult.data.content as string) as {
            questions?: Array<{ id: string; question: string; [key: string]: unknown }>;
          };
          content.questions = (content.questions ?? []).map((q) =>
            q.id === editingId ? { ...q, question: draftQuestion.trim() } : q,
          );
          await window.electron.db.studio.update(studioOutputId, {
            content: JSON.stringify(content),
          });
        }
      } else {
        await window.electron.db.flashcards.updateCard({
          id: editingId,
          question: draftQuestion.trim(),
          answer: draftAnswer.trim(),
        });
      }
      setEditingId(null);
      onRefresh?.();
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <Empty><EmptyHeader><EmptyTitle>{quizQuestions
          ? t('learn.deck_no_questions', 'No questions yet.')
          : t('learn.deck_no_cards', 'No cards yet.')}</EmptyTitle><EmptyDescription>{t('learn.deck_empty_description', 'Generated cards and questions will appear here.')}</EmptyDescription></EmptyHeader></Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ItemGroup>
        {items.map((item, index) => (
          <Item key={item.id} variant="outline">
            <ItemMedia><Badge variant="secondary">{String(index + 1).padStart(2, '0')}</Badge></ItemMedia>
            <ItemContent>
              <ItemTitle>{item.question}</ItemTitle>
              {item.difficulty ? (
                <ItemDescription><Badge variant="outline">{item.difficulty}</Badge></ItemDescription>
              ) : null}
            </ItemContent>
            <ItemActions><Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('ui.edit', 'Edit')}
                onClick={() => openEdit(item)}
              >
                <HugeiconsIcon icon={PencilIcon} />
              </Button></ItemActions>
          </Item>
        ))}
      </ItemGroup>

      {editingId ? (
        <Dialog open onOpenChange={(open) => { if (!open) setEditingId(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('learn.edit_question', 'Edit question')}</DialogTitle><DialogDescription>{t('learn.edit_question_description', 'Update the study content without changing its review history.')}</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field><FieldLabel htmlFor="learn-question">{t('flashcard.question', 'Question')}</FieldLabel><Textarea id="learn-question"
                  value={draftQuestion}
                  onChange={(e) => setDraftQuestion(e.target.value)}
                /></Field>
              {!quizQuestions ? (
                <Field><FieldLabel htmlFor="learn-answer">{t('flashcard.answer', 'Answer')}</FieldLabel><Textarea id="learn-answer"
                    value={draftAnswer}
                    onChange={(e) => setDraftAnswer(e.target.value)}
                  /></Field>
              ) : null}
            </FieldGroup>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>
                  {t('learn.cancel', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  disabled={saving || !draftQuestion.trim()}
                  onClick={() => void handleSave()}
                >
                  {saving ? <Spinner data-icon="inline-start" /> : null}{t('ui.save', 'Save')}
                </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
