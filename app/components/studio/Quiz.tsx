
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  CancelCircleIcon,
  ArrowRight02Icon,
  RotateLeft01Icon,
  Cancel01Icon,
  AlertCircleIcon,
  ShuffleIcon,
  BubbleChatIcon,
} from '@hugeicons/core-free-icons';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { useTranslation } from 'react-i18next';
import { normalizeQuizData } from '@/lib/studio/normalizeQuizContent';
import type { QuizData, QuizQuestion } from '@/types';
import { lazyRef } from '@/lib/utils/lazyRef';

interface QuizProps {
  data: QuizData;
  title?: string;
  onClose?: () => void;
  /** Learn redesign styling + enriched UX */
  learnMode?: boolean;
  /** Persist runs to quiz_runs when finished */
  studioOutputId?: string;
}

interface QuestionResult {
  questionId: string;
  correct: boolean;
  elapsedMs: number;
  selected: number | string | null;
}

function shuffleQuestions(items: QuizQuestion[]): QuizQuestion[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--destructive)';

  return (
    <svg width={size} height={size} className="mx-auto mb-4" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="var(--foreground)"
        fontSize={28}
        fontWeight={700}
        fontFamily="var(--font-sans)"
      >
        {score}%
      </text>
    </svg>
  );
}

export default function Quiz({
  data: rawData,
  title,
  onClose,
  learnMode = false,
  studioOutputId,
}: QuizProps) {
  const { t } = useTranslation();
  const data = useMemo(() => normalizeQuizData(rawData) ?? { questions: [] }, [rawData]);
  const [questionOrder, setQuestionOrder] = useState<QuizQuestion[]>(() => data.questions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [questionResults, setQuestionResults] = useState<QuestionResult[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);
  const persistedRef = useRef(false);
  const sessionStartedAt = useRef<number | null>(null);
  lazyRef(sessionStartedAt, () => Date.now());

  const questions = questionOrder;
  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const correctCount = questionResults.filter((r) => r.correct).length;
  const missedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of questionResults) {
      if (!r.correct) ids.add(r.questionId);
    }
    return ids;
  }, [questionResults]);

  const prevQuestionsRef = useRef(data.questions);
  if (data.questions !== prevQuestionsRef.current) {
    prevQuestionsRef.current = data.questions;
    setQuestionOrder(data.questions);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setQuestionResults([]);
    setIsFinished(false);
    setQuestionStartedAt(Date.now());
    sessionStartedAt.current = Date.now();
    persistedRef.current = false;
  }

  useEffect(() => {
    if (isFinished) return;
    const tick = () => setElapsedSec(Math.floor((Date.now() - questionStartedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [questionStartedAt, isFinished]);

  const persistRun = useCallback(
    async (results: QuestionResult[]) => {
      if (!studioOutputId || persistedRef.current) return;
      persistedRef.current = true;
      const correct = results.filter((r) => r.correct).length;
      const startedAt = lazyRef(sessionStartedAt, () => Date.now());
      const durationMs = Date.now() - startedAt;
      try {
        await window.electron.db.quiz.createRun({
          studio_output_id: studioOutputId,
          total: results.length,
          correct,
          duration_ms: durationMs,
          per_question: results,
          started_at: startedAt,
          completed_at: Date.now(),
        });
      } catch (err) {
        console.error('[Quiz] persist run:', err);
      }
    },
    [studioOutputId],
  );

  const handleSelectAnswer = useCallback(
    (answer: number | string) => {
      if (showExplanation) return;
      setSelectedAnswer(answer);
    },
    [showExplanation],
  );

  const handleSubmit = useCallback(() => {
    if (selectedAnswer === null || !currentQuestion) return;
    const isCorrect = selectedAnswer === currentQuestion.correct;
    const elapsedMs = Date.now() - questionStartedAt;
    setQuestionResults((prev) => [
      ...prev,
      {
        questionId: currentQuestion.id,
        correct: isCorrect,
        elapsedMs,
        selected: selectedAnswer,
      },
    ]);
    setShowExplanation(true);
  }, [selectedAnswer, currentQuestion, questionStartedAt]);

  const finishQuiz = useCallback(
    (results: QuestionResult[]) => {
      setIsFinished(true);
      if (results.length > 0) void persistRun(results);
    },
    [persistRun],
  );

  const handleSkip = useCallback(() => {
    if (!currentQuestion || showExplanation) return;
    const nextResults: QuestionResult[] = [
      ...questionResults,
      {
        questionId: currentQuestion.id,
        correct: false,
        elapsedMs: Date.now() - questionStartedAt,
        selected: null,
      },
    ];
    setQuestionResults(nextResults);
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setQuestionStartedAt(Date.now());
    } else {
      finishQuiz(nextResults);
    }
  }, [currentQuestion, showExplanation, currentIndex, totalQuestions, questionStartedAt, questionResults, finishQuiz]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setQuestionStartedAt(Date.now());
    } else {
      finishQuiz(questionResults);
    }
  }, [currentIndex, totalQuestions, questionResults, finishQuiz]);

  const handleRestart = useCallback(
    (opts?: { onlyMissed?: boolean; shuffle?: boolean }) => {
      let next = data.questions;
      if (opts?.onlyMissed && missedIds.size > 0) {
        next = data.questions.filter((q) => missedIds.has(q.id));
      }
      if (opts?.shuffle) {
        next = shuffleQuestions(next);
      }
      setQuestionOrder(next);
      setCurrentIndex(0);
      setSelectedAnswer(null);
      setShowExplanation(false);
      setQuestionResults([]);
      setIsFinished(false);
      setQuestionStartedAt(Date.now());
      sessionStartedAt.current = Date.now();
      persistedRef.current = false;
    },
    [data.questions, missedIds],
  );

  const askMany = useCallback(() => {
    if (!currentQuestion) return;
    window.dispatchEvent(
      new CustomEvent('dome:many-requires-panel', {
        detail: {
          reason: 'quiz',
          prompt: `Help me understand this quiz question:\n\n${currentQuestion.question}\n\nExplanation: ${currentQuestion.explanation ?? ''}`,
        },
      }),
    );
  }, [currentQuestion]);

  useEffect(() => {
    if (!learnMode || isFinished) return;
    const onKey = (e: KeyboardEvent) => {
      if (showExplanation) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleNext();
        }
        return;
      }
      if (e.key === 'Enter' && selectedAnswer !== null) {
        e.preventDefault();
        handleSubmit();
        return;
      }
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleSkip();
        return;
      }
      if (currentQuestion?.type === 'multiple_choice' && e.key >= '1' && e.key <= '4') {
        const idx = parseInt(e.key, 10) - 1;
        if (currentQuestion.options && idx < currentQuestion.options.length) {
          e.preventDefault();
          handleSelectAnswer(idx);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    learnMode,
    isFinished,
    showExplanation,
    selectedAnswer,
    currentQuestion,
    handleSubmit,
    handleSkip,
    handleNext,
    handleSelectAnswer,
  ]);

  const frameClass = learnMode ? 'lr-frame lr-quiz' : '';
  const headerClass = learnMode ? 'lr-quiz-hd' : 'flex items-center justify-between px-4 py-3 border-b';
  const optionClass = learnMode ? 'lr-quiz-opt' : 'flex items-center gap-3 p-4 rounded-lg text-left transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150';

  if (data.questions.length === 0) {
    return (
      <div className={`flex flex-col h-full ${frameClass}`} style={{ background: 'var(--background)' }}>
        <div className={headerClass} style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-foreground">
            {title || t('quiz.title')}
          </h3>
          {onClose && (
            <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg" aria-label={t('quiz.close')}><HugeiconsIcon icon={Cancel01Icon} size={16} /></Button>
          )}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-12 mb-4 text-muted-foreground" />
          <p className="text-lg font-medium text-foreground">
            {t('studio.quiz_data_corrupted')}
          </p>
          {onClose && (
            <Button type="button" onClick={onClose} variant="secondary" className="mt-6">{t('quiz.close')}</Button>
          )}
        </div>
      </div>
    );
  }

  if (!currentQuestion && !isFinished) return null;

  if (isFinished) {
    const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const missedCount = totalQuestions - correctCount;
    return (
      <div className={`flex flex-col h-full ${frameClass}`} style={{ background: 'var(--background)' }}>
        <div className={headerClass} style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold text-foreground">
            {title || t('quiz.title')} — {t('quiz.results')}
          </h3>
          {onClose && (
            <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg" aria-label={t('quiz.close')}><HugeiconsIcon icon={Cancel01Icon} size={16} /></Button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-8">
          <div className="max-w-lg mx-auto text-center">
            {learnMode ? (
              <ScoreRing score={score} />
            ) : (
              <div className="text-6xl font-bold mb-2" style={{ color: score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--destructive)' }}>
                {score}%
              </div>
            )}
            <div className="text-lg font-medium mb-1 text-foreground">
              {score >= 70 ? t('quiz.great_job') : score >= 40 ? t('quiz.good_effort') : t('quiz.keep_studying')}
            </div>
            <div className="text-sm mb-6 text-muted-foreground">
              {t('quiz.correct_count', { correct: correctCount, total: totalQuestions })}
            </div>
            {learnMode && questionResults.length > 0 && (
              <div className="lr-quiz-breakdown text-left mb-6 flex flex-col gap-y-2">
                {questionResults.map((r, i) => {
                  const q = data.questions.find((qq) => qq.id === r.questionId);
                  return (
                    <div key={r.questionId} className="flex items-start gap-2 text-sm">
                      {r.correct ? (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="shrink-0 mt-0.5 text-[var(--success)]" />
                      ) : (
                        <HugeiconsIcon icon={CancelCircleIcon} size={16} className="shrink-0 mt-0.5 text-destructive" />
                      )}
                      <span className="text-muted-foreground">
                        {i + 1}. {q?.question?.slice(0, 80) ?? r.questionId}
                        {q?.question && q.question.length > 80 ? '…' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              <Button type="button" onClick={() => handleRestart()} variant="secondary" className="flex items-center gap-2">
                <HugeiconsIcon icon={RotateLeft01Icon} size={16} /> {t('quiz.try_again')}
              </Button>
              {learnMode && missedCount > 0 && (
                <Button
                  type="button"
                  onClick={() => handleRestart({ onlyMissed: true })}
                  variant="secondary" className="flex items-center gap-2"
                >
                  {t('learn.quiz_retry_missed', { count: missedCount })}
                </Button>
              )}
              {learnMode && (
                <Button
                  type="button"
                  onClick={() => handleRestart({ shuffle: true })}
                  variant="ghost" className="flex items-center gap-2"
                >
                  <HugeiconsIcon icon={ShuffleIcon} size={16} /> {t('quiz.shuffle', { defaultValue: 'Shuffle' })}
                </Button>
              )}
              {onClose && (
                <Button type="button" onClick={onClose} variant="ghost">{t('quiz.close')}</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className={`flex flex-col h-full ${frameClass}`} style={{ background: 'var(--background)' }}>
      <div className={headerClass} style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {title || t('quiz.title')}
          </h3>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--card)', color: 'var(--muted-foreground)' }}>
            {currentIndex + 1} / {totalQuestions}
          </span>
          {learnMode && (
            <span className="lr-quiz-timer text-xs tabular-nums text-muted-foreground">
              {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {learnMode && showExplanation && (
            <button type="button" onClick={askMany} className="lr-btn lr-btn-ghost flex items-center gap-1 text-xs">
              <HugeiconsIcon icon={BubbleChatIcon} size={14} /> {t('learn.quiz_ask_many')}
            </button>
          )}
          {onClose && (
            <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg" aria-label={t('quiz.close')}><HugeiconsIcon icon={Cancel01Icon} size={16} /></Button>
          )}
        </div>
      </div>

      <div className="h-1 bg-muted">
        <div
          className="h-full origin-left transition-transform duration-150 ease-[var(--ease-out)] motion-reduce:transition-none"
          style={{
            transform: `scaleX(${(currentIndex + (showExplanation ? 1 : 0)) / totalQuestions})`,
            background: 'var(--primary)',
          }}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className={`mb-6 ${learnMode ? 'lr-quiz-q' : 'text-lg font-medium'}`} style={{ color: 'var(--foreground)' }}>
            {currentQuestion.question}
          </h2>

          {currentQuestion.source_citation?.passage && learnMode && (
            <p className="lr-quiz-cite text-xs mb-4 italic text-muted-foreground">
              {t('learn.quiz_source_from', {
                source: currentQuestion.source_citation.passage.slice(0, 120),
              })}
            </p>
          )}

          {currentQuestion.type === 'multiple_choice' && currentQuestion.options && (
            <div className="flex flex-col gap-3">
              {currentQuestion.options.map((option, idx) => {
                const isSelected = selectedAnswer === idx;
                const isCorrect = showExplanation && idx === currentQuestion.correct;
                const isWrong = showExplanation && isSelected && idx !== currentQuestion.correct;

                return (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => handleSelectAnswer(idx)}
                    className={optionClass}
                    style={{
                      border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--destructive)' : isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isCorrect ? 'var(--success-bg)' : isWrong ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : isSelected ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--card)',
                      cursor: showExplanation ? 'default' : 'pointer',
                    }}
                  >
                    <span className="size-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                      style={{
                        background: isCorrect ? 'var(--success)' : isWrong ? 'var(--destructive)' : isSelected ? 'var(--primary)' : 'var(--muted)',
                        color: (isCorrect || isWrong || isSelected) ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                      }}
                    >
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm text-foreground">{option}</span>
                    {isCorrect && <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} className="ml-auto shrink-0 text-[var(--success)]" />}
                    {isWrong && <HugeiconsIcon icon={CancelCircleIcon} size={18} className="ml-auto shrink-0 text-destructive" />}
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion.type === 'true_false' && (
            <div className="flex gap-3">
              {[t('quiz.true_option'), t('quiz.false_option')].map((option, idx) => {
                const isSelected = selectedAnswer === idx;
                const isCorrect = showExplanation && idx === currentQuestion.correct;
                const isWrong = showExplanation && isSelected && idx !== currentQuestion.correct;

                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => handleSelectAnswer(idx)}
                    className="flex-1 p-4 rounded-lg text-center text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity,transform]"
                    style={{
                      border: `2px solid ${isCorrect ? 'var(--success)' : isWrong ? 'var(--destructive)' : isSelected ? 'var(--primary)' : 'var(--border)'}`,
                      background: isCorrect ? 'var(--success-bg)' : isWrong ? 'color-mix(in srgb, var(--destructive) 12%, transparent)' : isSelected ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--card)',
                      color: 'var(--foreground)',
                      cursor: showExplanation ? 'default' : 'pointer',
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {showExplanation && currentQuestion.explanation && (
            <div className={`mt-3 p-3 rounded-lg ${learnMode ? 'lr-quiz-explain' : ''} bg-muted border border-border`}>
              <div className="text-xs font-semibold uppercase mb-2 text-foreground">{t('quiz.explanation')}</div>
              <MarkdownRenderer content={currentQuestion.explanation} />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 py-4 border-t flex justify-between gap-3 border-border">
        {learnMode && !showExplanation && (
          <Button type="button" onClick={handleSkip} variant="ghost" className="text-sm">
            {t('learn.quiz_skip')}
          </Button>
        )}
        <div className="flex justify-end gap-3 ml-auto">
          {!showExplanation ? (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={selectedAnswer === null}
              
              style={{ opacity: selectedAnswer === null ? 0.5 : 1 }}
            >
              {t('quiz.check_answer')}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} className="flex items-center gap-2">
              {currentIndex < totalQuestions - 1 ? <>{t('quiz.next')} <HugeiconsIcon icon={ArrowRight02Icon} size={16} /></> : t('quiz.see_results')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
