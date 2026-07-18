import { ArrowLeft02Icon, Calendar03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import type { StudioOutput, TimelineData } from '@/types';
import LearnViewerEmpty from '../LearnViewerEmpty';
interface TimelineViewProps { output: StudioOutput; onBack: () => void; }
function parseDate(value: string) { const ts = Date.parse(value); return Number.isNaN(ts) ? 0 : ts; }
export default function TimelineView({ output, onBack }: TimelineViewProps) { const { t } = useTranslation(); const { events, corrupt } = useMemo(() => { if (!output.content) return { events: [] as TimelineData['events'], corrupt: false }; try { const data = JSON.parse(output.content) as TimelineData; return { events: [...(data.events ?? [])].sort((a, b) => parseDate(a.date) - parseDate(b.date)), corrupt: false }; } catch { return { events: [] as TimelineData['events'], corrupt: true }; } }, [output.content]); if (!events.length) return <LearnViewerEmpty onBack={onBack} corrupt={corrupt} />; return <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto p-5"><Button type="button" variant="ghost" size="sm" className="w-fit" onClick={onBack}><HugeiconsIcon icon={ArrowLeft02Icon} data-icon="inline-start" />{t('learn.back_to_library', 'Back to library')}</Button><div><h1 className="font-heading text-xl font-semibold">{output.title}</h1><p className="text-sm text-muted-foreground">{t('learn.timeline_count', '{{count}} events', { count: events.length })}</p></div><ItemGroup>{events.map((event, index) => <Item key={`${event.date}-${event.title}-${index}`} variant="outline"><ItemMedia variant="icon"><HugeiconsIcon icon={Calendar03Icon} /></ItemMedia><ItemContent><ItemDescription>{event.date}</ItemDescription><ItemTitle>{event.title}</ItemTitle><ItemDescription>{event.description}</ItemDescription></ItemContent></Item>)}</ItemGroup></div>; }
