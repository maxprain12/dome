/**
 * Onboarding role presets.
 *
 * A role drives three things when onboarding completes (see
 * `applyOnboardingConfig.ts`):
 *  1. Which features are visible by default (`visibleFeatures`).
 *  2. The agent's "soul" + seeded memory (`buildSoul` / `buildMemorySeed`),
 *     personalized with the user's name and free-text description.
 *  3. Which bundled skills get installed (`recommendedSkills`).
 *
 * Feature keys must match `TOGGLEABLE_FEATURE_KEYS` in
 * `app/lib/features/featureKeys.ts`. `library` is always visible and never
 * listed here.
 */

export type RoleId = 'developer' | 'study' | 'research' | 'generalist';

export interface RoleSoulContext {
  name: string;
  /** Free-text the user typed in the "tell me about you" box (may be empty). */
  freeText: string;
}

/** A bundled skill installed via `skills:installBundled`. */
export interface RecommendedSkill {
  bundledId: string;
}

export interface RolePreset {
  id: RoleId;
  /** i18n keys (namespace `roles`). */
  labelKey: string;
  descriptionKey: string;
  /** Emoji shown on the role card. */
  emoji: string;
  /** Features visible by default for this role; all others are hidden. */
  visibleFeatures: string[];
  /** Bundled skills installed on completion (best-effort, offline). */
  recommendedSkills: RecommendedSkill[];
  buildSoul: (ctx: RoleSoulContext) => string;
  buildMemorySeed: (ctx: RoleSoulContext) => string;
}

function focusLine(freeText: string, fallback: string): string {
  const trimmed = freeText.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    id: 'developer',
    labelKey: 'roles.developer.label',
    descriptionKey: 'roles.developer.desc',
    emoji: '👩‍💻',
    visibleFeatures: ['projects', 'tags', 'github', 'agents', 'workflows', 'automations', 'runs', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-commit-helper' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI companion inside Dome. You assist a
developer: someone who tracks projects, ships code, and automates their workflow.

## What the user focuses on
${focusLine(freeText, 'Software development — building, shipping and tracking projects, with automations and agents.')}

## How to interact
- Be concise and technical. Prefer code, commands and concrete steps over prose.
- Default to the project/automation surfaces: tasks, GitHub tracking, agents, runs.
- When suggesting changes, respect existing conventions and call out trade-offs.
- Proactively offer automations and agent workflows that remove repetitive work.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Role: developer. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'software development, project tracking and automation',
      )}`,
  },
  {
    id: 'study',
    labelKey: 'roles.study.label',
    descriptionKey: 'roles.study.desc',
    emoji: '📚',
    visibleFeatures: ['projects', 'calendar', 'tags', 'learn', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-study-planner' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI study companion inside Dome. You help
a learner understand material, retain it, and plan their study.

## What the user focuses on
${focusLine(freeText, 'Studying and learning — turning resources into understanding and long-term memory.')}

## How to interact
- Explain clearly, with examples and analogies; check understanding.
- Lean on the Learn surface: flashcards, spaced repetition, quizzes.
- Turn notes and resources into decks and study plans when useful.
- Encourage active recall and schedule reviews around the user's calendar.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Role: student. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'studying, learning and spaced-repetition review',
      )}`,
  },
  {
    id: 'research',
    labelKey: 'roles.research.label',
    descriptionKey: 'roles.research.desc',
    emoji: '🔬',
    visibleFeatures: ['projects', 'calendar', 'tags', 'agents', 'learn', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-source-synthesizer' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s research assistant inside Dome. You help
synthesize sources, track ideas, and keep claims grounded in evidence.

## What the user focuses on
${focusLine(freeText, 'Research — reading, synthesizing sources, and producing well-cited writing.')}

## How to interact
- Be rigorous: cite sources, separate fact from inference, flag uncertainty.
- Use semantic search and the knowledge base to ground answers in the user's resources.
- Help structure literature, summaries and synthesis; suggest agents for recurring research tasks.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Role: researcher. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'research, source synthesis and well-cited writing',
      )}`,
  },
  {
    id: 'generalist',
    labelKey: 'roles.generalist.label',
    descriptionKey: 'roles.generalist.desc',
    emoji: '🗂️',
    // Generalist keeps everything visible.
    visibleFeatures: ['projects', 'calendar', 'email', 'tags', 'github', 'agents', 'workflows', 'automations', 'runs', 'learn', 'marketplace'],
    recommendedSkills: [],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI companion inside Dome — a flexible
assistant for knowledge work, content and everyday tasks.

## What the user focuses on
${focusLine(freeText, 'A bit of everything — notes, content, planning and general knowledge work.')}

## How to interact
- Be friendly, clear and adaptable to whatever the user is working on.
- Surface the right Dome feature for the task (notes, calendar, agents, learn…).
- Keep answers practical and actionable.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Role: generalist. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'general knowledge work and content',
      )}`,
  },
];

export function getRolePreset(roleId: string | null | undefined): RolePreset | undefined {
  if (!roleId) return undefined;
  return ROLE_PRESETS.find((r) => r.id === roleId);
}
