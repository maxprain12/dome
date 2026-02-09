
import { Sparkles } from 'lucide-react';

interface SuggestedQuestionsProps {
  questions: string[];
  onSelect: (question: string) => void;
}

export default function SuggestedQuestions({ questions, onSelect }: SuggestedQuestionsProps) {
  if (!questions || questions.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={12} style={{ color: 'var(--dome-accent, #596037)' }} />
        <span className="text-[11px] font-medium" style={{ color: 'var(--tertiary-text)' }}>
          Suggested questions
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onSelect(q)}
            className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 text-left"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              color: 'var(--secondary-text)',
              maxWidth: '300px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--dome-accent, #596037)';
              e.currentTarget.style.color = 'var(--dome-accent, #596037)';
              e.currentTarget.style.background = 'var(--dome-accent-bg, #F5F3EE)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--secondary-text)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
          >
            {q.length > 80 ? q.slice(0, 77) + '...' : q}
          </button>
        ))}
      </div>
    </div>
  );
}
