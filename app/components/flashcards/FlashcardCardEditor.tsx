'use client';

import { useState } from 'react';
import { Trash2, GripVertical } from 'lucide-react';
import type { Flashcard } from '@/types';

interface FlashcardCardEditorProps {
  card: Flashcard;
  index: number;
  onUpdate: (cardId: string, updates: { question?: string; answer?: string; difficulty?: 'easy' | 'medium' | 'hard' }) => void;
  onDelete: (cardId: string) => void;
}

export default function FlashcardCardEditor({ card, index, onUpdate, onDelete }: FlashcardCardEditorProps) {
  const [question, setQuestion] = useState(card.question);
  const [answer, setAnswer] = useState(card.answer);
  const [difficulty, setDifficulty] = useState(card.difficulty);

  const handleBlur = () => {
    const updates: { question?: string; answer?: string; difficulty?: 'easy' | 'medium' | 'hard' } = {};
    if (question !== card.question) updates.question = question;
    if (answer !== card.answer) updates.answer = answer;
    if (difficulty !== card.difficulty) updates.difficulty = difficulty;
    if (Object.keys(updates).length > 0) {
      onUpdate(card.id, updates);
    }
  };

  const difficultyColors = {
    easy: { bg: 'rgba(16, 185, 129, 0.1)', text: 'var(--success, #10b981)' },
    medium: { bg: 'rgba(245, 158, 11, 0.1)', text: 'var(--warning, #f59e0b)' },
    hard: { bg: 'rgba(239, 68, 68, 0.1)', text: 'var(--error, #ef4444)' },
  } as const;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle / index */}
        <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
          <GripVertical className="w-4 h-4 opacity-30" style={{ color: 'var(--tertiary-text)' }} />
          <span
            className="text-[10px] font-bold"
            style={{ color: 'var(--tertiary-text)' }}
          >
            {index + 1}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-3">
          {/* Question */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Pregunta
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onBlur={handleBlur}
              className="input resize-none text-sm"
              rows={2}
              placeholder="Escribe la pregunta..."
            />
          </div>

          {/* Answer */}
          <div>
            <label
              className="text-[11px] font-semibold uppercase tracking-wider mb-1 block"
              style={{ color: 'var(--tertiary-text)' }}
            >
              Respuesta
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onBlur={handleBlur}
              className="input resize-none text-sm"
              rows={2}
              placeholder="Escribe la respuesta..."
            />
          </div>

          {/* Difficulty + actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {(['easy', 'medium', 'hard'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => {
                    setDifficulty(level);
                    onUpdate(card.id, { difficulty: level });
                  }}
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{
                    background: difficulty === level ? difficultyColors[level].bg : 'transparent',
                    color: difficulty === level ? difficultyColors[level].text : 'var(--tertiary-text)',
                    border: difficulty === level
                      ? `1px solid ${difficultyColors[level].text}20`
                      : '1px solid transparent',
                  }}
                >
                  {level === 'easy' ? 'Facil' : level === 'medium' ? 'Media' : 'Dificil'}
                </button>
              ))}
            </div>

            <button
              onClick={() => onDelete(card.id)}
              className="btn btn-ghost p-1.5 rounded-md transition-colors hover:bg-[rgba(239,68,68,0.1)]"
              aria-label="Eliminar tarjeta"
            >
              <Trash2 className="w-4 h-4" style={{ color: 'var(--error, #ef4444)' }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
