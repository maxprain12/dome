import { Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { useLearnStore } from '@/lib/store/useLearnStore';
import { formatElapsed } from '@/lib/learn/fsrs';
import FlashSrsButtons from './FlashSrsButtons';
interface FlashPlayerProps { onSessionEnd?: () => void; }
export default function FlashPlayer({ onSessionEnd }: FlashPlayerProps) {
  const { t } = useTranslation();
  const { dueCards, currentCardIndex, isCardFlipped, studyStartTime, sessionCorrect, sessionIncorrect, sessionPlannedCards, flipCard, reviewCard, skipCard, endStudy } = useLearnStore();
  const currentCard = dueCards[currentCardIndex]; const isComplete = currentCardIndex >= dueCards.length; const totalCards = sessionPlannedCards || dueCards.length; const studiedCount = Math.max(sessionCorrect + sessionIncorrect, currentCardIndex); const [elapsedSec, setElapsedSec] = useState(0);
  const handleEnd = async () => { await endStudy(); onSessionEnd?.(); };
  useEffect(() => { if (!studyStartTime) return; const tick = () => setElapsedSec(Math.floor((Date.now() - studyStartTime) / 1000)); tick(); const id = window.setInterval(tick, 1000); return () => window.clearInterval(id); }, [studyStartTime]);
  useEffect(() => { const handleKeyDown = (event: KeyboardEvent) => { if (isComplete) return; if (!isCardFlipped && (event.code === 'Space' || event.code === 'Enter')) { event.preventDefault(); flipCard(); } else if (isCardFlipped && event.key >= '1' && event.key <= '4') { event.preventDefault(); reviewCard(Number(event.key)); } else if (event.key.toLowerCase() === 's') { event.preventDefault(); skipCard(); } }; window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [isCardFlipped, isComplete, flipCard, reviewCard, skipCard]);
  if (isComplete) { const accuracy = sessionCorrect + sessionIncorrect > 0 ? Math.round((sessionCorrect / (sessionCorrect + sessionIncorrect)) * 100) : 0; return <Empty className="h-full"><EmptyHeader><EmptyMedia variant="icon"><HugeiconsIcon icon={CheckmarkCircle02Icon} /></EmptyMedia><EmptyTitle>{t('flashcard.session_complete', 'Session complete')}</EmptyTitle><EmptyDescription>{t('flashcard.studied_cards_count', 'You studied {{count}} cards', { count: studiedCount })} · {accuracy}%</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" onClick={() => void handleEnd()}>{t('flashcard.back_to_deck', 'Back to library')}</Button></EmptyContent></Empty>; }
  const progress = totalCards > 0 ? ((currentCardIndex + 1) / totalCards) * 100 : 0;
  return <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 p-5"><div className="grid grid-cols-[auto_1fr_auto] items-center gap-3"><Button type="button" variant="ghost" size="icon-sm" onClick={() => void handleEnd()} aria-label={t('ui.close', 'Close')}><HugeiconsIcon icon={Cancel01Icon} /></Button><Progress value={progress} aria-label={t('flashcard.study', 'Study')} /><span className="text-xs tabular-nums text-muted-foreground">{currentCardIndex + 1}/{totalCards} · {formatElapsed(elapsedSec * 1000)}</span></div><div className="flex flex-1 items-center justify-center"><Card className="w-full max-w-2xl transition-[opacity,transform] duration-200 motion-reduce:transition-none"><CardHeader><Badge variant="secondary" className="w-fit">{isCardFlipped ? t('flashcard.answer', 'Answer') : t('flashcard.question', 'Question')}</Badge><CardTitle className="text-center text-2xl">{isCardFlipped ? currentCard?.answer : currentCard?.question}</CardTitle><CardDescription className="text-center">{currentCard?.difficulty ?? '—'}</CardDescription></CardHeader><CardContent className="flex justify-center"><Button type="button" variant="outline" onClick={flipCard}>{isCardFlipped ? t('flashcard.show_question', 'Show question') : t('flashcard.show_answer', 'Show answer')}</Button></CardContent><CardFooter className="justify-center"><span className="text-xs text-muted-foreground">{isCardFlipped ? t('flashcard.rate_hint', 'Rate with keys 1–4') : t('flashcard.press_space_flip', 'Press Space to flip')}</span></CardFooter></Card></div>{isCardFlipped && currentCard ? <FlashSrsButtons card={currentCard} onReview={reviewCard} /> : null}</div>;
}
