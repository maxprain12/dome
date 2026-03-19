import { useEffect } from 'react';
import { Brain, Map, HelpCircle, BookOpen, MessageCircleQuestion, CalendarRange, Table2, Headphones } from 'lucide-react';
import type { StudioOutputType } from '@/types';
import { useLearnStore } from '@/lib/store/useLearnStore';

const typeIcons: Record<StudioOutputType, React.ReactNode> = {
  mindmap: <Map size={20} />,
  flashcards: <Brain size={20} />,
  quiz: <HelpCircle size={20} />,
  guide: <BookOpen size={20} />,
  faq: <MessageCircleQuestion size={20} />,
  timeline: <CalendarRange size={20} />,
  table: <Table2 size={20} />,
  audio: <Headphones size={20} />,
  video: <HelpCircle size={20} />,
  research: <HelpCircle size={20} />,
};

const typeLabels: Record<StudioOutputType, string> = {
  mindmap: 'Mind Map',
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  guide: 'Guía',
  faq: 'FAQ',
  timeline: 'Línea de tiempo',
  table: 'Tabla',
  audio: 'Audio',
  video: 'Video',
  research: 'Research',
};

const sectionToOutputType: Record<string, StudioOutputType> = {
  mindmaps: 'mindmap',
  quizzes: 'quiz',
  guides: 'guide',
  faqs: 'faq',
  timelines: 'timeline',
  tables: 'table',
};

export default function ContentGrid() {
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

  // Load stats for visible decks
  useEffect(() => {
    const decksToLoad = (activeSection === 'all' || activeSection === 'decks') ? decks : [];
    for (const deck of decksToLoad) {
      if (!deckStats[deck.id]) {
        loadDeckStats(deck.id);
      }
    }
  }, [activeSection, decks, deckStats, loadDeckStats]);

  // Determine what to show
  const showDecks = activeSection === 'all' || activeSection === 'decks';
  const outputTypeFilter = sectionToOutputType[activeSection];
  const showOutputs = activeSection === 'all' || !!outputTypeFilter;

  const visibleDecks = showDecks ? decks : [];
  const visibleOutputs = showOutputs
    ? (outputTypeFilter ? studioOutputs.filter((o) => o.type === outputTypeFilter) : studioOutputs)
    : [];

  const isEmpty = visibleDecks.length === 0 && visibleOutputs.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--dome-accent-bg)' }}
        >
          <Brain size={32} style={{ color: 'var(--dome-accent)' }} />
        </div>
        <h2 className="text-lg font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
          {activeSection === 'all' ? 'Aún no hay contenido' : 'No hay items en esta sección'}
        </h2>
        <p className="text-sm max-w-sm" style={{ color: 'var(--dome-text-muted)' }}>
          Crea un nuevo deck de flashcards o genera contenido de estudio con IA.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Flashcard decks */}
        {visibleDecks.map((deck) => {
          const stats = deckStats[deck.id];
          return (
            <div
              key={deck.id}
              className="group relative rounded-lg border p-5 transition-all hover:shadow-md"
              style={{
                background: 'var(--dome-surface)',
                borderColor: 'var(--dome-border)',
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--dome-accent-bg)' }}
                >
                  <Brain size={20} style={{ color: 'var(--dome-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate" style={{ color: 'var(--dome-text)' }}>
                    {deck.title}
                  </h3>
                  {deck.description && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--dome-text-muted)' }}>
                      {deck.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-4 pt-4 border-t" style={{ borderColor: 'var(--dome-border)' }}>
                {stats ? (
                  <>
                    <div className="text-xs">
                      <span style={{ color: 'var(--dome-text-muted)' }}>Total</span>
                      <span className="ml-1 font-medium" style={{ color: 'var(--dome-text)' }}>{stats.total}</span>
                    </div>
                    <div className="text-xs">
                      <span style={{ color: 'var(--dome-text-muted)' }}>Por revisar</span>
                      <span className="ml-1 font-medium" style={{ color: 'var(--warning)' }}>{stats.due_cards}</span>
                    </div>
                    <div className="text-xs">
                      <span style={{ color: 'var(--dome-text-muted)' }}>Dominadas</span>
                      <span className="ml-1 font-medium" style={{ color: 'var(--success)' }}>{stats.mastered_cards}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                    {deck.card_count} tarjetas
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-4">
                {(stats?.due_cards ?? 0) > 0 ? (
                  <button
                    onClick={() => startStudy(deck.id)}
                    className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: 'var(--dome-accent)',
                      color: 'white',
                    }}
                  >
                    Estudiar ({stats?.due_cards})
                  </button>
                ) : (
                  <div
                    className="flex-1 py-2 px-3 rounded-lg text-sm font-medium text-center"
                    style={{
                      background: 'var(--dome-bg)',
                      color: 'var(--dome-text-muted)',
                    }}
                  >
                    Todo listo
                  </div>
                )}
                <button
                  onClick={() => setDeckEditorOpen(true, deck.id)}
                  className="py-2 px-3 rounded-lg text-sm transition-all"
                  style={{
                    background: 'var(--dome-bg)',
                    color: 'var(--dome-text-muted)',
                  }}
                >
                  Editar
                </button>
              </div>

              <button
                onClick={() => confirm('¿Eliminar este deck?') && deleteDeck(deck.id)}
                className="absolute top-3 right-3 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
              >
                ×
              </button>
            </div>
          );
        })}

        {/* Studio outputs (mindmaps, quizzes, guides, faqs, timelines, tables, etc.) */}
        {visibleOutputs.map((output) => {
          const icon = typeIcons[output.type] ?? <Brain size={20} />;
          const label = typeLabels[output.type] ?? output.type;
          return (
            <div
              key={output.id}
              className="group relative rounded-lg border p-5 transition-all hover:shadow-md"
              style={{
                background: 'var(--dome-surface)',
                borderColor: 'var(--dome-border)',
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--dome-accent)' }}>
                    {label}
                  </p>
                  <h3 className="font-medium text-sm truncate" style={{ color: 'var(--dome-text)' }}>
                    {output.title}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => confirm('¿Eliminar este contenido?') && deleteStudioOutput(output.id)}
                className="absolute top-3 right-3 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
