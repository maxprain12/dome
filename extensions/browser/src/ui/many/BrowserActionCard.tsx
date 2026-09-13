import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../../app/components/ui/button';
import manyMark from '../../../../../public/many.png?inline';
import type { ToolReview } from '../../lib/agent-tools';

type Review = ToolReview & { resolve: (approved: boolean) => void };

export default function BrowserActionCard({ review, activity, onStop }: {
  review: Review | null;
  activity: string | null;
  onStop: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const detailId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    setRequesting(false);
    if (!review) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [review]);
  if (!review && !activity) return null;
  const tool = review?.name || activity || '';
  const name = t(`tool_${tool}`, { defaultValue: tool });
  const approve = () => {
    if (!review || requesting) return;
    setRequesting(true);
    // Host permission requests must start directly in this user gesture.
    const permission = review.origin
      ? browser.permissions.request({ origins: [`${review.origin}/*`] })
      : Promise.resolve(true);
    permission.then(review.resolve).catch(() => review.resolve(false));
  };
  return (
    <section className={`browser-action-card ${review ? 'is-review' : 'is-running'}`}
      role={review ? 'region' : 'status'} aria-labelledby={titleId} aria-describedby={detailId}
      onKeyDown={(event) => { if (review && event.key === 'Escape') { event.stopPropagation(); review.resolve(false); } }}>
      <div className="browser-action-heading">
        <img src={manyMark} alt="" width={28} height={28} />
        <div>
          <span className="browser-action-eyebrow">{t(review ? 'browserNeedsReview' : 'browserWorking')}</span>
          <strong id={titleId}>{name}</strong>
        </div>
        {!review ? <span className="browser-action-pulse" aria-hidden="true" /> : null}
      </div>
      <div id={detailId}>
        {review ? <>
          {review.origin || review.pageUrl ? <p className="browser-action-origin">{review.origin || review.pageUrl}</p> : null}
          <p className="browser-action-detail">{review.detail}</p>
          <p className="browser-action-hint">{t(review.origin ? 'browserAccessScope' : 'browserActionScope')}</p>
        </> : <p className="browser-action-hint">{t('browserWorkingHint')}</p>}
      </div>
      <div className="browser-action-buttons">
        {review ? <>
          <Button variant="outline" ref={cancelRef} onClick={() => review.resolve(false)}>{t('rejectAction')}</Button>
          <Button disabled={requesting} onClick={approve}>{t(review.origin ? 'allowPage' : 'confirmAction')}</Button>
        </> : <Button variant="outline" size="sm" onClick={onStop}>{t('browserStop')}</Button>}
      </div>
    </section>
  );
}
