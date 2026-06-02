import type { StudioOutputType } from '@/types';

export type LearnView = 'library' | 'deck' | 'studying';
export type LearnStudyMode = 'flashcards' | 'quiz' | null;

export type GenerateDifficulty = 'easy' | 'mixed' | 'hard' | 'exam';
export type GenerateLanguage = 'auto' | 'en' | 'es' | 'fr';

export interface GenerateConfig {
  title: string;
  count: number;
  difficulty: GenerateDifficulty;
  language: GenerateLanguage;
  instructions: string;
}

export type GenerateProgressPhase =
  | 'reading'
  | 'extracting'
  | 'writing'
  | 'explaining'
  | 'saving'
  | 'done'
  | 'error';

export interface GenerateProgress {
  runId: string;
  phase: GenerateProgressPhase;
  message: string;
  current?: number;
  total?: number;
  draftItem?: string;
  error?: string;
}

export interface LearnKpis {
  dueToday: number;
  dueTodayDelta: number;
  masteryGlobal: number;
  masteryDelta: number;
  streakDays: number;
  longestStreak: number;
  timeTodayMs: number;
  timeTodayGoalMs: number;
}

export interface LearnStreakDay {
  label: string;
  done: boolean;
  today: boolean;
}

export interface LearnStreak {
  days: LearnStreakDay[];
  dueToday: number;
  streakDays: number;
}

export interface WizardState {
  open: boolean;
  step: 0 | 1 | 2;
  showProgress: boolean;
  type: StudioOutputType | null;
  sourceIds: string[];
  config: GenerateConfig;
}

export const DEFAULT_GENERATE_CONFIG: GenerateConfig = {
  title: '',
  count: 15,
  difficulty: 'mixed',
  language: 'auto',
  instructions: '',
};

export const DEFAULT_WIZARD_STATE: WizardState = {
  open: false,
  step: 0,
  showProgress: false,
  type: null,
  sourceIds: [],
  config: { ...DEFAULT_GENERATE_CONFIG },
};

export type DeckItemKind = 'flashcard_deck' | StudioOutputType;

export interface LearnDeckItem {
  id: string;
  kind: DeckItemKind;
  title: string;
  description?: string;
  type: StudioOutputType | 'flashcards';
  count: number;
  mastery?: number;
  dueCount?: number;
  lastSeen?: number;
  pinned?: boolean;
  sourceIds?: string[];
  resourceId?: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuizRunRecord {
  id: string;
  studio_output_id: string;
  deck_id?: string | null;
  total: number;
  correct: number;
  duration_ms: number;
  per_question: string;
  started_at: number;
  completed_at: number;
}

export interface QuizRunQuestionResult {
  question_id: string;
  correct: boolean;
  ms: number;
  section?: string;
}
