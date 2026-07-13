import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronDownIcon,
  Cancel01Icon,
  BubbleChatIcon,
} from '@hugeicons/core-free-icons';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { FAQData } from '@/types';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface FAQProps {
  data: FAQData;
  title?: string;
  onClose?: () => void;
}

export default function FAQ({ data, title, onClose }: FAQProps) {
  const { t } = useTranslation();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border"
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={BubbleChatIcon} size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {title || t('studio.faq_title')}
          </h3>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--card)',
              color: 'var(--muted-foreground)',
            }}
          >
            {t('studio.faq_question_count', { count: data.pairs.length })}
          </span>
        </div>
        {onClose && (
          <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('studio.close_button')} title={t('studio.close_button')}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {data.pairs.map((pair, index) => {
            const isExpanded = expandedIndex === index;

            return (
              <Collapsible
                key={index}
                open={isExpanded}
                onOpenChange={(open) => setExpandedIndex(open ? index : null)}
                className="overflow-hidden rounded-lg border border-border bg-card transition-colors duration-150 ease-[var(--ease-out)] data-open:border-primary"
              >
                <CollapsibleTrigger
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span
                    className="size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: isExpanded
                        ? 'var(--primary)'
                        : 'var(--muted)',
                      color: isExpanded ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}
                  >
                    Q
                  </span>
                  <span
                    className="text-sm font-medium flex-1 text-foreground"
                  >
                    {pair.question}
                  </span>
                  <HugeiconsIcon icon={ChevronDownIcon}
                    size={16}
                    className="shrink-0 transition-transform"
                    style={{
                      color: 'var(--muted-foreground)',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                  />
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-4 pb-4 pl-[52px]">
                    <MarkdownRenderer content={pair.answer} />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </div>
    </div>
  );
}
