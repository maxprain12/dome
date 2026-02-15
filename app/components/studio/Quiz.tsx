
import { useState, useCallback } from 'react';
import { CheckCircle2, XCircle, ArrowRight, RotateCcw, X } from 'lucide-react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { QuizData, QuizQuestion } from '@/types';

interface QuizProps {
  data: QuizData;
  title?: string;
  onClose?: () => void;
}

export default function Quiz({ data, title, onClose }: QuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [results, setResults] = useState<Map<string, boolean>>(new Map());
  const [isFinished, setIsFinished] = useState(false);

  const questions = data.questions;
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const correctCount = Array.from(results.values()).filter(Boolean).length;

  const handleSelectAnswer = useCallback((answer: number | string) => {
    if (showExplanation) return; // Already answered
    setSelectedAnswer(answer);
  }, [showExplanation]);

  const handleSubmit = useCallback(() => {
    if (selectedAnswer === null || !currentQuestion) return;

    const isCorrect = selectedAnswer === currentQuestion.correct;
    setResults(prev => new Map(prev).set(currentQuestion.id, isCorrect));
    setShowExplanation(true);
  }, [selectedAnswer, currentQuestion]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      setIsFinished(true);
    }
  }, [currentIndex, totalQuestions]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setResults(new Map());
    setIsFinished(false);
  }, []);

  if (!currentQuestion && !isFinished) return null;
  if (!currentQuestion) return null;

  // Results screen
  if (isFinished) {
    const score = Math.round((correctCount / totalQuestions) * 100);
    return (
      <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            {title || 'Quiz'} -- Results
          </h3>
          {onClose && (
            <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close"><X size={16} /></button>
          )}
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-sm">
            <div className="text-6xl font-bold mb-2" style={{ color: score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--error)' }}>
              {score}%
            </div>
            <div className="text-lg font-medium mb-1" style={{ color: 'var(--primary-text)' }}>
              {score >= 70 ? 'Great job!' : score >= 40 ? 'Good effort!' : 'Keep studying!'}
            </div>
            <div className="text-sm mb-6" style={{ color: 'var(--secondary-text)' }}>
              {correctCount} of {totalQuestions} correct
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={handleRestart} className="btn btn-secondary flex items-center gap-2">
                <RotateCcw size={16} /> Try again
              </button>
              {onClose && (
                <button onClick={onClose} className="btn btn-ghost">Close</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            {title || 'Quiz'}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-secondary)', color: 'var(--secondary-text)' }}>
            {currentIndex + 1} / {totalQuestions}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close"><X size={16} /></button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${((currentIndex + (showExplanation ? 1 : 0)) / totalQuestions) * 100}%`,
            background: 'var(--dome-accent, #596037)',
          }}
        />
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-medium mb-6" style={{ color: 'var(--primary-text)' }}>
            {currentQuestion.question}
          </h2>

          {/* Options (multiple choice) */}
          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="flex flex-col gap-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedAnswer === idx;
                const isCorrect = showExplanation && idx === currentQuestion.correct;
                const isWrong = showExplanation && isSelected && idx !== currentQuestion.correct;

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectAnswer(idx)}
                    className="flex items-center gap-3 p-4 rounded-lg text-left transition-all duration-150"
                    style={{
                      border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--error)' : isSelected ? 'var(--dome-accent, #596037)' : 'var(--border)'}`,
                      background: isCorrect ? 'var(--success-bg)' : isWrong ? 'var(--error-bg)' : isSelected ? 'var(--dome-accent-bg, #F5F3EE)' : 'var(--bg-secondary)',
                      cursor: showExplanation ? 'default' : 'pointer',
                    }}
                  >
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{
                        background: isCorrect ? 'var(--success)' : isWrong ? 'var(--error)' : isSelected ? 'var(--dome-accent, #596037)' : 'var(--bg-tertiary)',
                        color: (isCorrect || isWrong || isSelected) ? '#FFFFFF' : 'var(--secondary-text)',
                      }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--primary-text)' }}>{option}</span>
                    {isCorrect && <CheckCircle2 size={18} className="ml-auto shrink-0" style={{ color: 'var(--success)' }} />}
                    {isWrong && <XCircle size={18} className="ml-auto shrink-0" style={{ color: 'var(--error)' }} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* True/False */}
          {currentQuestion.type === 'true_false' && (
            <div className="flex gap-3">
              {['True', 'False'].map((option, idx) => {
                const isSelected = selectedAnswer === idx;
                const isCorrect = showExplanation && idx === currentQuestion.correct;
                const isWrong = showExplanation && isSelected && idx !== currentQuestion.correct;

                return (
                  <button
                    key={option}
                    onClick={() => handleSelectAnswer(idx)}
                    className="flex-1 p-4 rounded-lg text-center text-sm font-medium transition-all"
                    style={{
                      border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--error)' : isSelected ? 'var(--dome-accent, #596037)' : 'var(--border)'}`,
                      background: isCorrect ? 'var(--success-bg)' : isWrong ? 'var(--error-bg)' : isSelected ? 'var(--dome-accent-bg)' : 'var(--bg-secondary)',
                      color: 'var(--primary-text)',
                      cursor: showExplanation ? 'default' : 'pointer',
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {/* Explanation */}
          {showExplanation && currentQuestion.explanation && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--dome-border)]">
              <div className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--dome-text)' }}>Explanation</div>
              <div className="prose prose-sm max-w-none" style={{ color: 'var(--dome-text)' }}>
                <MarkdownRenderer content={currentQuestion.explanation} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t flex justify-end gap-3" style={{ borderColor: 'var(--border)' }}>
        {!showExplanation ? (
          <button
            onClick={handleSubmit}
            disabled={selectedAnswer === null}
            className="btn btn-primary"
            style={{ opacity: selectedAnswer === null ? 0.5 : 1 }}
          >
            Check Answer
          </button>
        ) : (
          <button onClick={handleNext} className="btn btn-primary flex items-center gap-2">
            {currentIndex < totalQuestions - 1 ? <>Next <ArrowRight size={16} /></> : 'See Results'}
          </button>
        )}
      </div>
    </div>
  );
}
