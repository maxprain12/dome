import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  Cancel01Icon,
  CopyIcon,
  CheckIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { StudyGuideData } from '@/types';
import { useTranslation } from 'react-i18next';

interface StudyGuideProps {
  data: StudyGuideData;
  title?: string;
  onClose?: () => void;
}

export default function StudyGuide({ data, title, onClose }: StudyGuideProps) {
  const { t } = useTranslation();
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
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border"
      >
        <h3 className="text-sm font-semibold text-foreground">
          {title || 'Study Guide'}
        </h3>
        {onClose && (
          <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('studio.close_button')} title={t('studio.close_button')}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-y-4">
          {data.sections.map((section, index) => {
            const isExpanded = expandedSections.has(index);

            return (
              <div
                key={index}
                className="rounded-lg overflow-hidden"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                }}
              >
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => toggleSection(index)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group"
                  style={{
                    background: isExpanded ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'transparent',
                  }}
                >
                  {isExpanded ? (
                    <HugeiconsIcon icon={ChevronDownIcon} size={16} className="text-muted-foreground" />
                  ) : (
                    <HugeiconsIcon icon={ChevronRightIcon} size={16} className="text-muted-foreground" />
                  )}
                  <span
                    className="text-sm font-semibold flex-1 text-foreground"
                  >
                    {section.title}
                  </span>
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copySection(section.content, index);
                    }}
                    variant="ghost" className="p-2.5 min-h-[44px] min-w-[44px] opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy section"
                    aria-label="Copy section"
                  >
                    {copiedIndex === index ? (
                      <HugeiconsIcon icon={CheckIcon} size={14} className="text-[var(--success)]" />
                    ) : (
                      <HugeiconsIcon icon={CopyIcon} size={14} className="text-muted-foreground" />
                    )}
                  </Button>
                </button>

                {/* Section content */}
                {isExpanded && (
                  <div className="px-4 pb-4">
                    <MarkdownRenderer content={section.content} />
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
