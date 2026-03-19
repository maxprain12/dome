import { Sparkles, Layers, Brain, HelpCircle, BookOpen, CalendarRange, Table2, Plus, Wand2 } from 'lucide-react';
import type { LearnSection } from '@/lib/store/useLearnStore';

interface NavItem {
  id: LearnSection;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

interface LearnNavProps {
  activeSection: LearnSection;
  onSectionChange: (section: LearnSection) => void;
  deckCount: number;
  onCreateDeck: () => void;
  onGenerate: () => void;
}

export default function LearnNav({
  activeSection,
  onSectionChange,
  deckCount,
  onCreateDeck,
  onGenerate,
}: LearnNavProps) {
  const mainNav: NavItem[] = [
    { id: 'all', label: 'Todo', icon: <Layers size={18} /> },
    { id: 'decks', label: 'Flashcards', icon: <Brain size={18} />, count: deckCount },
    { id: 'mindmaps', label: 'Mind Maps', icon: <Brain size={18} /> },
    { id: 'quizzes', label: 'Quizzes', icon: <HelpCircle size={18} /> },
    { id: 'guides', label: 'Guías', icon: <BookOpen size={18} /> },
    { id: 'faqs', label: 'FAQs', icon: <HelpCircle size={18} /> },
    { id: 'timelines', label: 'Líneas de tiempo', icon: <CalendarRange size={18} /> },
    { id: 'tables', label: 'Tablas', icon: <Table2 size={18} /> },
  ];

  return (
    <nav className="w-56 shrink-0 flex flex-col h-full border-r" style={{ borderColor: 'var(--dome-border)', background: 'var(--dome-surface)' }}>
      <div className="p-4 flex items-center gap-3 border-b" style={{ borderColor: 'var(--dome-border)' }}>
        <Sparkles size={20} style={{ color: 'var(--dome-accent)' }} />
        <h1 className="font-semibold text-base">Learn</h1>
      </div>

      <div className="p-3 flex gap-2">
        <button
          onClick={onGenerate}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'var(--dome-accent)',
            color: 'white',
          }}
        >
          <Wand2 size={16} />
          Generar
        </button>
        <button
          onClick={onCreateDeck}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: 'var(--dome-surface)',
            border: '1px solid var(--dome-border)',
            color: 'var(--dome-text)',
          }}
        >
          <Plus size={16} />
          Nuevo
        </button>
      </div>

      <div className="flex-1 overflow-auto py-2">
        {mainNav.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all"
            style={{
              background: activeSection === item.id ? 'var(--dome-accent-bg)' : 'transparent',
              color: activeSection === item.id ? 'var(--dome-accent)' : 'var(--dome-text-muted)',
              borderLeft: activeSection === item.id ? '2px solid var(--dome-accent)' : '2px solid transparent',
            }}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.count !== undefined && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: activeSection === item.id ? 'var(--dome-accent)' : 'var(--dome-bg)',
                  color: activeSection === item.id ? 'white' : 'var(--dome-text-muted)',
                }}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
