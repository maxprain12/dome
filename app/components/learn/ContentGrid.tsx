import { useEffect } from 'react';
import {
  Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion,
  CalendarRange, Table2, Headphones, Play, Pencil, Trash2,
  Sparkles, ChevronRight, FlameKindling,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StudioOutputType } from '@/types';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { useAppStore } from '@/lib/store/useAppStore';

// ─── Type config ─────────────────────────────────────────────────────────────

interface TypeConfig {
  icon: React.ReactNode;
  labelKey: string;
  fallbackLabel: string;
}

const typeConfigBase: Record<StudioOutputType, TypeConfig> = {
  mindmap:    { icon: <Map size={14} />,                   labelKey: 'content.mind_map', fallbackLabel: 'Mind Map' },
  flashcards: { icon: <Brain size={14} />,                  labelKey: 'flashcard.flashcards', fallbackLabel: 'Flashcards' },
  quiz:       { icon: <HelpCircle size={14} />,             labelKey: 'content.quiz', fallbackLabel: 'Quiz' },
  guide:      { icon: <BookOpen size={14} />,               labelKey: 'content.guide', fallbackLabel: 'Guía' },
  faq:        { icon: <MessageCircleQuestion size={14} />,  labelKey: 'content.faq', fallbackLabel: 'FAQ' },
  timeline:   { icon: <CalendarRange size={14} />,          labelKey: 'content.timeline', fallbackLabel: 'Línea de tiempo' },
  table:      { icon: <Table2 size={14} />,                  labelKey: 'content.table', fallbackLabel: 'Tabla' },
  audio:      { icon: <Headphones size={14} />,             labelKey: 'content.audio', fallbackLabel: 'Audio' },
  video:      { icon: <Play size={14} />,                   labelKey: 'content.video', fallbackLabel: 'Video' },
  research:   { icon: <Sparkles size={14} />,               labelKey: 'content.research', fallbackLabel: 'Research' },
};

const sectionToOutputType: Record<string, StudioOutputType> = {
  mindmaps: 'mindmap',
  quizzes: 'quiz',
  guides: 'guide',
  faqs: 'faq',
  timelines: 'timeline',
  tables: 'table',
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Content stats parser ─────────────────────────────────────────────────────

interface ContentStats {
  stat?: string;   // e.g. "12 preguntas", "5 secciones"
  preview?: string; // first item title/text preview
}

function parseContentStats(type: StudioOutputType, content?: string): ContentStats {
  if (!content) return {};
  try {
    const data = JSON.parse(content) as Record<string, unknown>;
    switch (type) {
      case 'quiz': {
        const qs = Array.isArray(data.questions) ? data.questions : [];
        const first = (qs[0] as { question?: string } | undefined)?.question;
        return {
          stat: `${qs.length} pregunta${qs.length !== 1 ? 's' : ''}`,
          preview: first ? first.slice(0, 90) : undefined,
        };
      }
      case 'guide': {
        const ss = Array.isArray(data.sections) ? data.sections : [];
        const first = (ss[0] as { title?: string } | undefined)?.title;
        return {
          stat: `${ss.length} sección${ss.length !== 1 ? 'es' : ''}`,
          preview: first,
        };
      }
      case 'faq': {
        const ps = Array.isArray(data.pairs) ? data.pairs : [];
        const first = (ps[0] as { question?: string } | undefined)?.question;
        return {
          stat: `${ps.length} pregunta${ps.length !== 1 ? 's' : ''}`,
          preview: first ? first.slice(0, 90) : undefined,
        };
      }
      case 'timeline': {
        const evs = Array.isArray(data.events) ? data.events : [];
        const first = evs[0] as { date?: string; title?: string } | undefined;
        return {
          stat: `${evs.length} evento${evs.length !== 1 ? 's' : ''}`,
          preview: first ? `${first.date ?? ''} · ${first.title ?? ''}`.trim().replace(/^·\s*/, '') : undefined,
        };
      }
      case 'table': {
        const cols = Array.isArray(data.columns) ? data.columns.length : 0;
        const rows = Array.isArray(data.rows) ? data.rows.length : 0;
        return { stat: `${cols} col${cols !== 1 ? 's' : ''} · ${rows} fila${rows !== 1 ? 's' : ''}` };
      }
      case 'mindmap': {
        const nodes = Array.isArray(data.nodes) ? data.nodes.length : 0;
        return { stat: `${nodes} nodo${nodes !== 1 ? 's' : ''}` };
      }
      default:
        return {};
    }
  } catch {
    return {};
  }
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState({ section }: { section: string }) {
  const { t } = useTranslation();
  const messages: Record<string, { titleKey: string; titleFallback: string; descKey: string; descFallback: string }> = {
    all: { titleKey: 'empty.all_title', titleFallback: 'Tu espacio de estudio está vacío', descKey: 'empty.all_desc', descFallback: 'Genera contenido con IA o crea un deck de flashcards para empezar.' },
    decks: { titleKey: 'empty.decks_title', titleFallback: 'Sin decks de flashcards', descKey: 'empty.decks_desc', descFallback: 'Crea un deck y añade tarjetas para practicar con repetición espaciada.' },
    mindmaps: { titleKey: 'empty.mindmaps_title', titleFallback: 'Sin mind maps', descKey: 'empty.mindmaps_desc', descFallback: 'Genera un mapa mental desde cualquier recurso de tu biblioteca.' },
    quizzes: { titleKey: 'empty.quizzes_title', titleFallback: 'Sin quizzes', descKey: 'empty.quizzes_desc', descFallback: 'Crea un quiz para poner a prueba tu conocimiento.' },
    guides: { titleKey: 'empty.guides_title', titleFallback: 'Sin guías de estudio', descKey: 'empty.guides_desc', descFallback: 'Genera guías detalladas con IA desde tus documentos.' },
    faqs: { titleKey: 'empty.faqs_title', titleFallback: 'Sin FAQs', descKey: 'empty.faqs_desc', descFallback: 'Genera preguntas frecuentes desde tus recursos.' },
    timelines: { titleKey: 'empty.timelines_title', titleFallback: 'Sin líneas de tiempo', descKey: 'empty.timelines_desc', descFallback: 'Visualiza secuencias cronológicas con IA.' },
    tables: { titleKey: 'empty.tables_title', titleFallback: 'Sin tablas', descKey: 'empty.tables_desc', descFallback: 'Genera tablas comparativas desde tus documentos.' },
  };
  const msg = messages[section] ?? messages['all']!;
  const title = t(msg.titleKey, msg.titleFallback);
  const desc = t(msg.descKey, msg.descFallback);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-12 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
        style={{ background: 'var(--dome-accent-bg)' }}
      >
        <Brain size={28} style={{ color: 'var(--dome-accent)' }} />
      </div>
      <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--dome-text)' }}>
        {title}
      </h2>
      <p className="text-sm max-w-xs leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
        {desc}
      </p>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ count, label }: { count: number; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
        {label}
      </span>
      <span
        className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
      >
        {count}
      </span>
    </div>
  );
}

// ─── Deck Card ────────────────────────────────────────────────────────────────

function DeckCard({
  deck,
  stats,
  onStudy,
  onEdit,
  onDelete,
}: {
  deck: { id: string; title: string; description?: string; card_count: number };
  stats?: { total: number; due_cards: number; mastered_cards: number };
  onStudy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const hasDue = (stats?.due_cards ?? 0) > 0;
  const masteredPct = stats?.total ? Math.round((stats.mastered_cards / stats.total) * 100) : 0;
  const total = stats?.total ?? deck.card_count;

  return (
    <div
      className="group relative flex flex-col rounded-lg border transition-all duration-150 hover:border-[var(--dome-accent)]"
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
    >
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain size={12} style={{ color: 'var(--dome-text-muted)' }} />
              <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
                {t('flashcard.flashcards', 'Flashcards')}
              </span>
            </div>
            <h3 className="font-medium text-sm leading-snug line-clamp-2" style={{ color: 'var(--dome-text)' }}>
              {deck.title}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: 'var(--dome-text-muted)' }}
              title={t('ui.edit', 'Editar')}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
              style={{ color: 'var(--dome-text-muted)' }}
              title={t('ui.delete', 'Eliminar')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Stats inline */}
        <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
          <span><span className="font-semibold" style={{ color: 'var(--dome-text)' }}>{total}</span> {t('flashcard.cards', 'tarjetas')}</span>
          {stats && (
            <>
              <span style={{ color: 'var(--dome-border)' }}>·</span>
              <span>
                <span className="font-semibold" style={{ color: hasDue ? 'var(--dome-accent)' : 'var(--dome-text)' }}>
                  {stats.due_cards}
                </span>{' '}{t('flashcard.to_review', 'por revisar')}
              </span>
            </>
          )}
        </div>

        {/* Progress bar */}
        {stats && stats.total > 0 && (
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--dome-border)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${masteredPct}%`, background: 'var(--dome-accent)' }}
            />
          </div>
        )}

        {/* Study action */}
        <button
          onClick={onStudy}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all border"
          style={hasDue ? {
            background: 'var(--dome-accent-bg)',
            borderColor: 'var(--dome-accent)',
            color: 'var(--dome-accent)',
          } : {
            background: 'transparent',
            borderColor: 'var(--dome-border)',
            color: 'var(--dome-text-muted)',
          }}
        >
          {hasDue ? <><FlameKindling size={12} /> {t('flashcard.study', 'Estudiar')} · {stats?.due_cards}</> : <>✓ {t('flashcard.up_to_date', 'Al día')}</>}
        </button>
      </div>
    </div>
  );
}

// ─── Studio Output Card ───────────────────────────────────────────────────────

function OutputCard({
  output,
  onOpen,
  onDelete,
}: {
  output: { id: string; title: string; type: StudioOutputType; content?: string; created_at: number; updated_at: number };
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const config = typeConfigBase[output.type] ?? typeConfigBase.guide;
  const { stat, preview } = parseContentStats(output.type, output.content);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="group relative flex flex-col rounded-lg border transition-all duration-150 hover:border-[var(--dome-accent)] cursor-pointer"
      style={{ background: 'var(--dome-surface)', borderColor: 'var(--dome-border)' }}
    >
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Type label + title */}
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span style={{ color: 'var(--dome-text-muted)' }}>{config.icon}</span>
            <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--dome-text-muted)' }}>
              {t(config.labelKey, config.fallbackLabel)}
            </span>
          </div>
          <h3 className="font-medium text-sm leading-snug line-clamp-2" style={{ color: 'var(--dome-text)' }}>
            {output.title}
          </h3>
        </div>

        {/* Content preview */}
        {(stat || preview) && (
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--dome-text-muted)' }}>
            {stat && (
              <span className="font-medium" style={{ color: 'var(--dome-text)' }}>
                {stat}
              </span>
            )}
            {preview && (
              <span className="line-clamp-2">
                {stat ? ' · ' : ''}{preview}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <span className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
            {formatDate(output.updated_at)}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] font-medium" style={{ color: 'var(--dome-accent)' }}>{t('ui.open', 'Abrir')}</span>
            <ChevronRight size={11} style={{ color: 'var(--dome-accent)' }} />
          </div>
        </div>
      </div>

      {/* Delete on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--dome-text-muted)' }}
        title={t('ui.delete', 'Eliminar')}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentGrid() {
  const { t } = useTranslation();
  const {
    activeSection,
    decks,
    studioOutputs,
    deckStats,
    loadDeckStats,
    startStudy,
    setDeckEditorOpen,
    deleteDeck,
    deleteStudioOutput,
  } = useLearnStore();
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);

  // Load stats for visible decks
  useEffect(() => {
    const decksToLoad = (activeSection === 'all' || activeSection === 'decks') ? decks : [];
    for (const deck of decksToLoad) {
      if (!deckStats[deck.id]) loadDeckStats(deck.id);
    }
  }, [activeSection, decks, deckStats, loadDeckStats]);

  const showDecks = activeSection === 'all' || activeSection === 'decks';
  const outputTypeFilter = sectionToOutputType[activeSection];
  const showOutputs = activeSection === 'all' || !!outputTypeFilter;

  const visibleDecks = showDecks ? decks : [];
  const visibleOutputs = showOutputs
    ? (outputTypeFilter ? studioOutputs.filter((o) => o.type === outputTypeFilter) : studioOutputs)
    : [];

  const isEmpty = visibleDecks.length === 0 && visibleOutputs.length === 0;

  if (isEmpty) {
    return <EmptyState section={activeSection} />;
  }

  const showBothSections = visibleDecks.length > 0 && visibleOutputs.length > 0 && activeSection === 'all';

  return (
    <div className="p-6 pb-10">
      {/* Decks section */}
      {visibleDecks.length > 0 && (
        <div className={showBothSections ? 'mb-8' : ''}>
          {showBothSections && <SectionLabel count={visibleDecks.length} label={t('flashcard.decks_section', 'Decks de Flashcards')} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleDecks.map((deck) => (
              <DeckCard
                key={deck.id}
                deck={deck}
                stats={deckStats[deck.id]}
                onStudy={() => startStudy(deck.id)}
                onEdit={() => setDeckEditorOpen(true, deck.id)}
                onDelete={() => confirm(t('flashcard.confirm_delete_deck', '¿Eliminar este deck?')) && deleteDeck(deck.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Studio outputs section */}
      {visibleOutputs.length > 0 && (
        <div>
          {showBothSections && <SectionLabel count={visibleOutputs.length} label={t('content.generated_content', 'Contenido generado')} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleOutputs.map((output) => (
              <OutputCard
                key={output.id}
                output={output}
                onOpen={() => setActiveStudioOutput(output)}
                onDelete={() => confirm(t('content.confirm_delete_content', '¿Eliminar este contenido?')) && deleteStudioOutput(output.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
