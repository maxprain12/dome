
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  Calendar03Icon,
} from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { TimelineData } from '@/types';
import { useTranslation } from 'react-i18next';

interface TimelineProps {
  data: TimelineData;
  title?: string;
  onClose?: () => void;
}

export default function Timeline({ data, title, onClose }: TimelineProps) {
  const { t } = useTranslation();
  const events = data.events;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0 border-border"
      >
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Calendar03Icon} size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {title || 'Timeline'}
          </h3>
        </div>
        {onClose && (
          <Button type="button" onClick={onClose} variant="ghost" className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" aria-label={t('studio.close_button')} title={t('studio.close_button')}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto relative">
          {/* Vertical line */}
          <div
            className="absolute left-[19px] top-0 bottom-0 w-[2px] bg-border"
          />

          {events.map((event, index) => (
            <div key={index} className="relative flex gap-4 pb-8 last:pb-0">
              {/* Dot */}
              <div className="relative shrink-0" style={{ zIndex: 'var(--z-local)' }}>
                <div
                  className="size-10 rounded-full flex items-center justify-center"
                  style={{
                    background: index === 0
                      ? 'var(--primary)'
                      : 'var(--card)',
                    border: `2px solid ${index === 0 ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: index === 0 ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    }}
                  >
                    {index + 1}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <div
                  className="text-xs font-medium mb-1 text-primary"
                >
                  {event.date}
                </div>
                <h4
                  className="text-sm font-semibold mb-1 text-foreground"
                >
                  {event.title}
                </h4>
                <div className="text-sm leading-relaxed">
                  <MarkdownRenderer content={event.description || ''} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
