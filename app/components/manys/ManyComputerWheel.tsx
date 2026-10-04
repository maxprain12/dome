import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Wheel } from '@/lib/manys/useComputerControl';
import { cn } from '@/lib/utils';

interface Props {
  wheel: Wheel;
  busy: boolean;
  /** The computer cannot be driven right now (off, or the browser permission is off). */
  disabled?: boolean;
  onTake: () => void;
  onRelease: () => void;
}

/** Who has the computer, what that means, and the one button that changes it. */
export default function ManyComputerWheel({ wheel, busy, disabled = false, onTake, onRelease }: Props) {
  const { t } = useTranslation();
  const you = wheel === 'you';
  const key = wheel === 'you' ? 'human' : wheel === 'handback' ? 'snapshot' : 'agent';
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] bg-muted px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span aria-hidden="true" className={cn('mt-1.5 size-[7px] shrink-0 rounded-full', you ? 'bg-warning' : 'bg-success')} />
        <div className="min-w-0 grow">
          <strong className="font-semibold">{t(`manys.computer.${key}Title`)}</strong>
          <p className="text-muted-foreground">{t(`manys.computer.${key}Hint`)}</p>
        </div>
      </div>
      <Button type="button" size="sm" className="w-full" variant={you ? 'outline' : 'default'} disabled={busy || (disabled && !you)} onClick={you ? onRelease : onTake}>
        {t(you ? 'manys.computer.release' : 'manys.computer.take')}
      </Button>
    </div>
  );
}
