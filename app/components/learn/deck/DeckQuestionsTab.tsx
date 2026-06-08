import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { Flashcard } from '@/types';

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
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <p className="lr-tab-empty">
        {quizQuestions
          ? t('learn.deck_no_questions', 'No questions yet.')
          : t('learn.deck_no_cards', 'No cards yet.')}
      </p>
    );
  }

  return (
    <div className="lr-body" style={{ paddingTop: 16 }}>
      <div className="lr-q-list">
        {items.map((item, index) => (
          <div key={item.id} className="lr-q-row">
            <span className="lr-q-num">{String(index + 1).padStart(2, '0')}</span>
            <div className="lr-q-content">
              <div className="lr-q-text">{item.question}</div>
              {item.difficulty ? (
                <div className="lr-q-meta">
                  <span
                    className={`lr-q-badge${
                      item.difficulty === 'easy' ? ' easy' : item.difficulty === 'hard' ? ' hard' : ' med'
                    }`}
                  >
                    {item.difficulty}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="lr-q-actions">
              <button
                type="button"
                className="lr-q-action"
                aria-label={t('ui.edit', 'Edit')}
                onClick={() => openEdit(item)}
              >
                <Pencil size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingId ? (
        <div className="lr-scrim" role="presentation">
          <div className="lr-modal" role="dialog" aria-modal="true">
            <div className="lr-modal-hd">
              <div className="lr-modal-hd-text">
                <h2>{t('learn.edit_question', 'Edit question')}</h2>
              </div>
            </div>
            <div className="lr-modal-body">
              <div className="lr-field">
                <label className="lr-field-label">{t('flashcard.question', 'Question')}</label>
                <textarea
                  className="lr-textarea"
                  value={draftQuestion}
                  onChange={(e) => setDraftQuestion(e.target.value)}
                />
              </div>
              {!quizQuestions ? (
                <div className="lr-field">
                  <label className="lr-field-label">{t('flashcard.answer', 'Answer')}</label>
                  <textarea
                    className="lr-textarea"
                    value={draftAnswer}
                    onChange={(e) => setDraftAnswer(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
            <div className="lr-modal-ft">
              <div className="lr-modal-ft-right">
                <button type="button" className="lr-btn" onClick={() => setEditingId(null)}>
                  {t('learn.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  className="lr-btn lr-btn-primary"
                  disabled={saving || !draftQuestion.trim()}
                  onClick={() => void handleSave()}
                >
                  {t('ui.save', 'Save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
