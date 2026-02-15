import { useState } from 'react';
import { ChevronDown, X, MessageCircle } from 'lucide-react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { FAQData } from '@/types';

interface FAQProps {
  data: FAQData;
  title?: string;
  onClose?: () => void;
}

export default function FAQ({ data, title, onClose }: FAQProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} style={{ color: 'var(--dome-accent, #596037)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            {title || 'Frequently Asked Questions'}
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--bg-secondary)',
              color: 'var(--secondary-text)',
            }}
          >
            {data.pairs.length} questions
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-3">
          {data.pairs.map((pair, index) => {
            const isExpanded = expandedIndex === index;

            return (
              <div
                key={index}
                className="rounded-lg overflow-hidden transition-all"
                style={{
                  border: `1px solid ${isExpanded ? 'var(--dome-accent, #596037)' : 'var(--border)'}`,
                  background: 'var(--bg-secondary)',
                }}
              >
                <button
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: isExpanded
                        ? 'var(--dome-accent, #596037)'
                        : 'var(--bg-tertiary)',
                      color: isExpanded ? '#FFFFFF' : 'var(--secondary-text)',
                    }}
                  >
                    Q
                  </span>
                  <span
                    className="text-sm font-medium flex-1"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    {pair.question}
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 transition-transform"
                    style={{
                      color: 'var(--tertiary-text)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pl-[52px] prose prose-sm max-w-none" style={{ color: 'var(--secondary-text)' }}>
                    <MarkdownRenderer content={pair.answer} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
