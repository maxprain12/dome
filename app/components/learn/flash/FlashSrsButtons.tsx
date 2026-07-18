import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Flashcard } from '@/types';
import { previewIntervals, formatInterval } from '@/lib/learn/fsrs';
interface FlashSrsButtonsProps { card: Flashcard; onReview: (quality: number) => void; }
const BUTTONS = [{ quality: 1 as const, labelKey: 'flashcard.again', fallback: 'Again' }, { quality: 2 as const, labelKey: 'flashcard.difficult', fallback: 'Hard' }, { quality: 3 as const, labelKey: 'flashcard.good', fallback: 'Good' }, { quality: 4 as const, labelKey: 'flashcard.easy', fallback: 'Easy' }] as const;
export default function FlashSrsButtons({ card, onReview }: FlashSrsButtonsProps) { const { t } = useTranslation(); const units = useMemo(() => ({ min: t('flashcard.unit_min', 'min'), h: t('flashcard.unit_hour', 'h'), d: t('flashcard.unit_day', 'd'), mo: t('flashcard.unit_month', 'mo'), y: t('flashcard.unit_year', 'y') }), [t]); const previews = useMemo(() => previewIntervals(card), [card]); return <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">{BUTTONS.map((button) => <Button key={button.quality} type="button" variant={button.quality === 3 ? 'default' : 'outline'} className="h-auto flex-col gap-0.5" onClick={() => onReview(button.quality)}><span>{t(button.labelKey, button.fallback)}</span><span className="text-xs opacity-70">{formatInterval(previews[button.quality], units)}</span></Button>)}</div>; }
