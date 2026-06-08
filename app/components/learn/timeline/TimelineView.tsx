import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudioOutput, TimelineData } from '@/types';
import LearnViewerEmpty from '../LearnViewerEmpty';

interface TimelineViewProps {
  output: StudioOutput;
  onBack: () => void;
}

function parseDate(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

export default function TimelineView({ output, onBack }: TimelineViewProps) {
  const { t } = useTranslation();

  const { events, corrupt } = useMemo(() => {
    if (!output.content) return { events: [] as TimelineData['events'], corrupt: false };
    try {
      const data = JSON.parse(output.content) as TimelineData;
      return {
        events: [...(data.events ?? [])].sort((a, b) => parseDate(a.date) - parseDate(b.date)),
        corrupt: false,
      };
    } catch {
      return { events: [] as TimelineData['events'], corrupt: true };
    }
  }, [output.content]);

  if (events.length === 0) {
    return <LearnViewerEmpty onBack={onBack} corrupt={corrupt} />;
  }

  return (
    <div className="lr-timeline">
      <div className="lr-timeline-hd">
        <button type="button" className="lr-deck-back" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden />
          {t('learn.back_to_library', 'Back to library')}
        </button>
        <h1>{output.title}</h1>
        <p className="lr-timeline-sub">
          {t('learn.timeline_count', '{{count}} events', { count: events.length })}
        </p>
      </div>
      <div className="lr-timeline-track">
        {events.map((event, index) => (
          <div key={`${event.date}-${event.title}-${index}`} className="lr-timeline-event">
            <div className="lr-timeline-dot" />
            <div className="lr-timeline-card">
              <div className="lr-timeline-date">{event.date}</div>
              <div className="lr-timeline-title">{event.title}</div>
              <div className="lr-timeline-desc">{event.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
