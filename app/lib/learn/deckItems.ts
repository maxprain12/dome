import type { FlashcardDeck, FlashcardDeckStats, StudioOutput, StudioOutputType } from '@/types';
import type { LearnDeckItem } from '@/lib/learn/types';
import type { LearnSection } from '@/lib/store/useLearnStore';

/** Cards available to study now (new + review-due). */
export function flashcardStudyableCount(stats?: FlashcardDeckStats): number {
  if (!stats) return 0;
  return (stats.new_cards ?? 0) + (stats.due_cards ?? 0);
}

export function resolveFlashDeckId(
  activeDeckId: string | null,
  deck?: FlashcardDeck | null,
  output?: StudioOutput | null,
): string | null {
  if (deck?.id) return deck.id;
  if (output?.type === 'flashcards' && output.deck_id) return output.deck_id;
  return activeDeckId;
}

const SECTION_TYPE_MAP: Record<Exclude<LearnSection, 'all' | 'decks'>, StudioOutputType> = {
  mindmaps: 'mindmap',
  quizzes: 'quiz',
  guides: 'guide',
  faqs: 'faq',
  timelines: 'timeline',
  tables: 'table',
};

export function visualTypeFor(item: Pick<LearnDeckItem, 'type'>): string {
  switch (item.type) {
    case 'flashcards':
      return 'flash';
    case 'mindmap':
      return 'mind';
    case 'quiz':
      return 'quiz';
    case 'guide':
      return 'guide';
    case 'faq':
      return 'faq';
    case 'timeline':
      return 'timeline';
    case 'table':
      return 'table';
    default:
      return 'flash';
  }
}

export function parseStudioContentCount(type: StudioOutputType, content?: string): number {
  if (!content) return 0;
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    switch (type) {
      case 'quiz':
        return Array.isArray(data.questions) ? data.questions.length : 0;
      case 'guide':
        return Array.isArray(data.sections) ? data.sections.length : 0;
      case 'faq':
        return Array.isArray(data.pairs) ? data.pairs.length : 0;
      case 'timeline':
        return Array.isArray(data.events) ? data.events.length : 0;
      case 'table':
        return Array.isArray(data.rows) ? data.rows.length : 0;
      case 'mindmap':
        return Array.isArray(data.nodes) ? data.nodes.length : 0;
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

export function buildLearnDeckItems(
  decks: FlashcardDeck[],
  studioOutputs: StudioOutput[],
  deckStats: Record<string, FlashcardDeckStats>,
): LearnDeckItem[] {
  const deckIds = new Set(decks.map((d) => d.id));
  const items: LearnDeckItem[] = [];

  for (const deck of decks) {
    const stats = deckStats[deck.id];
    const total = stats?.total ?? deck.card_count;
    items.push({
      id: deck.id,
      kind: 'flashcard_deck',
      title: deck.title,
      description: deck.description,
      type: 'flashcards',
      count: total,
      mastery: stats?.maturity ?? (total > 0 ? Math.round(((stats?.mastered_cards ?? 0) / total) * 100) : 0),
      dueCount: flashcardStudyableCount(stats),
      lastSeen: deck.updated_at,
      pinned: false,
      sourceIds: deck.resource_id ? [deck.resource_id] : undefined,
      resourceId: deck.resource_id,
      projectId: deck.project_id,
      createdAt: deck.created_at,
      updatedAt: deck.updated_at,
    });
  }

  for (const output of studioOutputs) {
    if (output.type === 'flashcards' && output.deck_id && deckIds.has(output.deck_id)) {
      continue;
    }

    const count =
      output.type === 'flashcards'
        ? output.deck_card_count ?? 0
        : parseStudioContentCount(output.type, output.content);

    let sourceIds: string[] | undefined;
    if (output.source_ids) {
      try {
        const parsed = JSON.parse(output.source_ids) as unknown;
        sourceIds = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : undefined;
      } catch {
        sourceIds = undefined;
      }
    }

    items.push({
      id: output.id,
      kind: output.type,
      title: output.title,
      type: output.type,
      count,
      mastery: undefined,
      dueCount: undefined,
      lastSeen: output.updated_at,
      pinned: false,
      sourceIds,
      resourceId: output.resource_id,
      projectId: output.project_id,
      createdAt: output.created_at,
      updatedAt: output.updated_at,
    });
  }

  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function filterLearnItems(
  items: LearnDeckItem[],
  section: LearnSection,
  searchQuery: string,
): LearnDeckItem[] {
  let filtered = items;

  if (section === 'decks') {
    filtered = filtered.filter((i) => i.kind === 'flashcard_deck' || i.type === 'flashcards');
  } else if (section !== 'all') {
    const outputType = SECTION_TYPE_MAP[section];
    filtered = filtered.filter((i) => i.type === outputType);
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        (i.description?.toLowerCase().includes(q) ?? false),
    );
  }

  return filtered;
}

export function countBySection(items: LearnDeckItem[]): Record<LearnSection, number> {
  return {
    all: items.length,
    decks: items.filter((i) => i.kind === 'flashcard_deck' || i.type === 'flashcards').length,
    mindmaps: items.filter((i) => i.type === 'mindmap').length,
    quizzes: items.filter((i) => i.type === 'quiz').length,
    guides: items.filter((i) => i.type === 'guide').length,
    faqs: items.filter((i) => i.type === 'faq').length,
    timelines: items.filter((i) => i.type === 'timeline').length,
    tables: items.filter((i) => i.type === 'table').length,
  };
}

/** Decks that actually need study now (have due/new cards). */
export function continueStudyingItems(items: LearnDeckItem[]): LearnDeckItem[] {
  return items.filter((i) => (i.dueCount ?? 0) > 0);
}

/**
 * Recently created/updated content. Pass the ids already shown under
 * "Continue studying" so the same item never appears in two sections.
 */
export function recentlyCreatedItems(
  items: LearnDeckItem[],
  excludeIds?: Set<string>,
  limit = 12,
): LearnDeckItem[] {
  const pool = excludeIds ? items.filter((i) => !excludeIds.has(i.id)) : items;
  return [...pool].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function titleGlyph(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}
