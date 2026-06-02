import type { QuizData } from '@/types';
import type { QuizRunQuestionResult, QuizRunRecord } from '@/lib/learn/types';

export interface QuizDeckStats {
  total: number;
  lastScorePct: number | null;
  masteryPct: number;
  hardestLabel: string | null;
  avgTimeSec: number | null;
}

function parsePerQuestion(raw: string): QuizRunQuestionResult[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QuizRunQuestionResult[]) : [];
  } catch {
    return [];
  }
}

export function computeQuizDeckStats(
  quizRuns: QuizRunRecord[],
  quizData: QuizData | null,
): QuizDeckStats {
  const total = quizData?.questions.length ?? 0;
  if (quizRuns.length === 0) {
    return { total, lastScorePct: null, masteryPct: 0, hardestLabel: null, avgTimeSec: null };
  }

  const last = quizRuns[0];
  const lastScorePct = last.total > 0 ? Math.round((last.correct / last.total) * 100) : null;

  const masteryPct = Math.round(
    quizRuns.reduce((sum, run) => sum + (run.total > 0 ? (run.correct / run.total) * 100 : 0), 0) /
      quizRuns.length,
  );

  const avgTimeSec = Math.round(
    quizRuns.reduce((sum, run) => sum + run.duration_ms, 0) / quizRuns.length / 1000,
  );

  const wrongCounts = new Map<string, number>();
  for (const run of quizRuns) {
    for (const entry of parsePerQuestion(run.per_question)) {
      if (!entry.correct) {
        wrongCounts.set(entry.question_id, (wrongCounts.get(entry.question_id) ?? 0) + 1);
      }
    }
  }

  let hardestId = '';
  let maxWrong = 0;
  for (const [id, count] of wrongCounts) {
    if (count > maxWrong) {
      maxWrong = count;
      hardestId = id;
    }
  }

  const hardestLabel =
    hardestId && quizData
      ? (quizData.questions.find((q) => q.id === hardestId)?.question ?? null)
      : null;

  return { total, lastScorePct, masteryPct, hardestLabel, avgTimeSec };
}
