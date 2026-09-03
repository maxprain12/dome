/**
 * Dome edition catalog — source of truth for nav, modules, and Many's soul.
 *
 * Docs: docs/product/positioning.md, docs/product/editions.md.
 * Feature keys must match `TOGGLEABLE_FEATURE_KEYS` in featureKeys.ts.
 * `library` is always visible and never listed in `modules`.
 */

import { TOGGLEABLE_FEATURE_KEYS, isFeatureVisible } from '@/lib/features/featureKeys';

export type EditionId = 'pro' | 'study' | 'dev';

export const DEFAULT_EDITION: EditionId = 'pro';

export const EDITION_IDS: readonly EditionId[] = ['pro', 'study', 'dev'];

/** Sidebar + command-palette order. Keep in sync with UnifiedSidebar. */
export const NAV_ITEM_ORDER = [
  'library',
  'projects',
  'people',
  'email',
  'social',
  'calendar',
  'github',
  'agents',
  'pipelines',
  'workflows',
  'automations',
  'runs',
  'learn',
  'marketplace',
] as const;

const LEGACY_ROLE_TO_EDITION: Record<string, EditionId> = {
  pro: 'pro',
  study: 'study',
  dev: 'dev',
  developer: 'dev',
  research: 'pro',
  generalist: 'pro',
};

export function resolveEditionId(raw: string | null | undefined): EditionId {
  if (!raw) return DEFAULT_EDITION;
  return LEGACY_ROLE_TO_EDITION[raw] ?? DEFAULT_EDITION;
}

export interface EditionSoulContext {
  name: string;
  freeText: string;
}

export interface RecommendedSkill {
  bundledId: string;
}

export interface EditionPreset {
  id: EditionId;
  labelKey: string;
  descriptionKey: string;
  /** Features on by default; every other toggleable key is off. */
  modules: string[];
  recommendedSkills: RecommendedSkill[];
  buildSoul: (ctx: EditionSoulContext) => string;
  buildMemorySeed: (ctx: EditionSoulContext) => string;
}

function focusLine(freeText: string, fallback: string): string {
  const trimmed = freeText.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export const EDITION_PRESETS: EditionPreset[] = [
  {
    id: 'pro',
    labelKey: 'roles.pro.label',
    descriptionKey: 'roles.pro.desc',
    modules: ['projects', 'people', 'email', 'social', 'agents', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-source-synthesizer' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI companion inside Dome Pro. You help a
founder-creator explore documents and move a network of people.

## What the user focuses on
${focusLine(freeText, 'Professional work — documents, relationships, email and social as channels of that network.')}

## How to interact
- Treat **documents** and **people** as the two poles. Email and social are channels, not separate products.
- Ground answers in the library. When a person is in context, use their identities, mail, and related docs.
- Turn a resource into a brief, post, or mail for a specific person when useful.
- Keep lead handling light: next action and context, not an enterprise CRM.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Edition: pro. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'documents, people, and professional communication',
      )}`,
  },
  {
    id: 'study',
    labelKey: 'roles.study.label',
    descriptionKey: 'roles.study.desc',
    modules: ['projects', 'calendar', 'learn', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-study-planner' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI study companion inside Dome Study. You help
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
      `Edition: study. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'studying, learning and spaced-repetition review',
      )}`,
  },
  {
    id: 'dev',
    labelKey: 'roles.dev.label',
    descriptionKey: 'roles.dev.desc',
    modules: ['projects', 'github', 'agents', 'marketplace'],
    recommendedSkills: [{ bundledId: 'dome-commit-helper' }],
    buildSoul: ({ name, freeText }) => `# SOUL — Many

## Identity
You are **Many**, ${name || 'the user'}'s AI companion inside Dome Dev. You assist a
builder: someone who tracks projects, ships code, and automates their workflow.

## What the user focuses on
${focusLine(freeText, 'Software development — building, shipping and tracking projects, with automations and agents.')}

## How to interact
- Be concise and technical. Prefer code, commands and concrete steps over prose.
- Default to the project and GitHub surfaces; use agents when a task repeats.
- When suggesting changes, respect existing conventions and call out trade-offs.
- Proactively offer automations that remove repetitive work.
`,
    buildMemorySeed: ({ name, freeText }) =>
      `Edition: dev. ${name ? `Name: ${name}. ` : ''}Focus: ${focusLine(
        freeText,
        'software development, project tracking and automation',
      )}`,
  },
];

export function getEdition(id: string | null | undefined): EditionPreset {
  const resolved = resolveEditionId(id);
  const found = EDITION_PRESETS.find((edition) => edition.id === resolved);
  if (found) return found;
  return EDITION_PRESETS[0];
}

export function visibilityForEdition(editionId: string | null | undefined): Record<string, boolean> {
  const edition = getEdition(editionId);
  const visibility: Record<string, boolean> = {};
  for (const key of TOGGLEABLE_FEATURE_KEYS) {
    visibility[key] = edition.modules.includes(key);
  }
  return visibility;
}

/**
 * Fill keys missing from a stored map using the edition default.
 * New modules (e.g. `people`) must not leak on for editions that omit them.
 */
export function fillMissingVisibility(
  editionId: string | null | undefined,
  visibility: Record<string, boolean>,
): Record<string, boolean> {
  if (!editionId) return visibility;
  const defaults = visibilityForEdition(editionId);
  const next = { ...visibility };
  for (const key of TOGGLEABLE_FEATURE_KEYS) {
    if (!(key in next)) next[key] = defaults[key];
  }
  return next;
}

export function visibleNavKeys(
  visibility: Record<string, boolean>,
  order: readonly string[] = NAV_ITEM_ORDER,
): string[] {
  const keys: string[] = [];
  for (const key of order) {
    if (key === 'library' || isFeatureVisible(visibility, key)) keys.push(key);
  }
  return keys;
}

export function expectedNavKeys(editionId: EditionId): string[] {
  return visibleNavKeys(visibilityForEdition(editionId));
}
