'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, X, Copy, Check } from 'lucide-react';
import type { StudyGuideData } from '@/types';

interface StudyGuideProps {
  data: StudyGuideData;
  title?: string;
  onClose?: () => void;
}

export default function StudyGuide({ data, title, onClose }: StudyGuideProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    new Set(data.sections.map((_, i) => i)) // All expanded by default
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const copySection = async (content: string, index: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
          {title || 'Study Guide'}
        </h3>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost p-1.5">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {data.sections.map((section, index) => {
            const isExpanded = expandedSections.has(index);

            return (
              <div
                key={index}
                className="rounded-lg overflow-hidden"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                }}
              >
                {/* Section header */}
                <button
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group"
                  style={{
                    background: isExpanded ? 'var(--dome-accent-bg, #F5F3EE)' : 'transparent',
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} style={{ color: 'var(--secondary-text)' }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: 'var(--secondary-text)' }} />
                  )}
                  <span
                    className="text-sm font-semibold flex-1"
                    style={{ color: 'var(--primary-text)' }}
                  >
                    {section.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copySection(section.content, index);
                    }}
                    className="btn btn-ghost p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy section"
                  >
                    {copiedIndex === index ? (
                      <Check size={14} style={{ color: 'var(--success)' }} />
                    ) : (
                      <Copy size={14} style={{ color: 'var(--tertiary-text)' }} />
                    )}
                  </button>
                </button>

                {/* Section content */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ color: 'var(--secondary-text)' }}
                    >
                      {section.content}
                    </div>
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
