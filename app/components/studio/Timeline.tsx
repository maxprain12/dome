
import { X, Calendar } from 'lucide-react';
import type { TimelineData } from '@/types';

interface TimelineProps {
  data: TimelineData;
  title?: string;
  onClose?: () => void;
}

export default function Timeline({ data, title, onClose }: TimelineProps) {
  const events = data.events;

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <Calendar size={16} style={{ color: 'var(--dome-accent, #596037)' }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            {title || 'Timeline'}
          </h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2" aria-label="Close" title="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto relative">
          {/* Vertical line */}
          <div
            className="absolute left-[19px] top-0 bottom-0 w-[2px]"
            style={{ background: 'var(--border)' }}
          />

          {events.map((event, index) => (
            <div key={index} className="relative flex gap-4 pb-8 last:pb-0">
              {/* Dot */}
              <div className="relative shrink-0" style={{ zIndex: 'var(--z-local)' }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: index === 0
                      ? 'var(--dome-accent, #596037)'
                      : 'var(--bg-secondary)',
                    border: `2px solid ${index === 0 ? 'var(--dome-accent, #596037)' : 'var(--border)'}`,
                  }}
                >
                  <span
                    className="text-xs font-bold"
                    style={{
                      color: index === 0 ? '#FFFFFF' : 'var(--secondary-text)',
                    }}
                  >
                    {index + 1}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <div
                  className="text-xs font-medium mb-1"
                  style={{ color: 'var(--dome-accent, #596037)' }}
                >
                  {event.date}
                </div>
                <h4
                  className="text-sm font-semibold mb-1"
                  style={{ color: 'var(--primary-text)' }}
                >
                  {event.title}
                </h4>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--secondary-text)' }}
                >
                  {event.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
