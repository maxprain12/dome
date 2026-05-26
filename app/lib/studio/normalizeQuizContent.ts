/**
 * Defensive quiz normalization for renderer (mirrors electron/services/studio-validators.cjs).
 * Repairs legacy persisted content where `correct` is string/boolean/1-based.
 */

import type { QuizData, QuizQuestion } from '@/types';

const TRUE_STRINGS = new Set(['true', 'verdadero', 'v', 'yes', 'sí', 'si', 't']);
const FALSE_STRINGS = new Set(['false', 'falso', 'f', 'no']);

function trimString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

export function normalizeQuizCorrect(
  correct: unknown,
  type: 'multiple_choice' | 'true_false',
  options?: string[],
): number | null {
  if (type === 'true_false') {
    if (options && options.length >= 2) {
      const fromOptions = normalizeQuizCorrect(correct, 'multiple_choice', options);
      if (fromOptions !== null && fromOptions <= 1) return fromOptions;
    }

    if (typeof correct === 'boolean') {
      return correct ? 0 : 1;
    }
    if (typeof correct === 'number' && Number.isFinite(correct)) {
      const n = Math.trunc(correct);
      if (n === 0 || n === 1) return n;
      return null;
    }
    if (typeof correct === 'string') {
      const lower = correct.trim().toLowerCase();
      if (TRUE_STRINGS.has(lower)) return 0;
      if (FALSE_STRINGS.has(lower)) return 1;
      const parsed = Number.parseInt(lower, 10);
      if (!Number.isNaN(parsed) && (parsed === 0 || parsed === 1)) return parsed;
    }
    return null;
  }

  const opts = Array.isArray(options) ? options.map((o) => trimString(o)).filter(Boolean) : [];
  if (opts.length < 2) return null;

  if (typeof correct === 'number' && Number.isFinite(correct)) {
    const n = Math.trunc(correct);
    if (n >= 0 && n < opts.length) return n;
    if (n >= 1 && n === opts.length) return n - 1;
    return null;
  }

  if (typeof correct === 'boolean') {
    return correct ? 0 : 1;
  }

  if (typeof correct === 'string') {
    const trimmed = correct.trim();
    if (!trimmed) return null;

    const letterMatch = /^[A-Za-z]$/.exec(trimmed);
    if (letterMatch) {
      const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < opts.length) return idx;
    }

    const asNum = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(asNum)) {
      if (asNum >= 0 && asNum < opts.length) return asNum;
      if (asNum >= 1 && asNum <= opts.length) return asNum - 1;
    }

    const lower = trimmed.toLowerCase();
    const matchIdx = opts.findIndex((o) => o.toLowerCase() === lower);
    if (matchIdx >= 0) return matchIdx;
  }

  return null;
}

function normalizeQuestion(raw: unknown, index: number): QuizQuestion | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const q = raw as Record<string, unknown>;
  const questionText = trimString(q.question);
  if (!questionText) return null;

  const typeRaw = trimString(q.type).toLowerCase();
  if (typeRaw !== 'multiple_choice' && typeRaw !== 'true_false') return null;

  const id = trimString(q.id) || `q${index + 1}`;
  const explanation = trimString(q.explanation) || '';
  const correctRaw = q.correct ?? q.correct_answer ?? q.answer;

  if (typeRaw === 'multiple_choice') {
    if (!Array.isArray(q.options)) return null;
    const options = q.options.map((o) => trimString(o)).filter(Boolean);
    if (options.length < 2) return null;

    const correctIdx = normalizeQuizCorrect(correctRaw, 'multiple_choice', options);
    if (correctIdx === null) return null;

    return {
      id,
      type: 'multiple_choice',
      question: questionText,
      options,
      correct: correctIdx,
      explanation,
    };
  }

  const tfOptions = Array.isArray(q.options)
    ? q.options.map((o) => trimString(o)).filter(Boolean)
    : undefined;
  const correctIdx = normalizeQuizCorrect(
    correctRaw,
    'true_false',
    tfOptions && tfOptions.length >= 2 ? tfOptions : undefined,
  );
  if (correctIdx === null) return null;

  return {
    id,
    type: 'true_false',
    question: questionText,
    correct: correctIdx,
    explanation,
  };
}

/**
 * Normalize quiz data for rendering. Returns null if no valid questions remain.
 */
export function normalizeQuizData(data: unknown): QuizData | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const input = data as Record<string, unknown>;
  const questionsRaw = input.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) return null;

  const questions: QuizQuestion[] = [];
  for (let i = 0; i < questionsRaw.length; i++) {
    const normalized = normalizeQuestion(questionsRaw[i], i);
    if (normalized) questions.push(normalized);
  }

  if (questions.length === 0) return null;
  return { questions };
}
