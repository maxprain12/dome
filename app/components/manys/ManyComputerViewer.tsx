import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Wheel } from '@/lib/manys/useComputerControl';
import ManyComputerDesktop from './ManyComputerDesktop';
import ManyComputerWheel from './ManyComputerWheel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manyId: string;
  name: string;
  wheel: Wheel;
  busy: boolean;
  onTake: () => void;
  onRelease: () => void;
  onResync: () => Promise<boolean>;
}

/** The computer's desktop at a size worth driving: the whole screen, who has the wheel, and the button to change it. */
export default function ManyComputerViewer({ open, onOpenChange, manyId, name, wheel, busy, onTake, onRelease, onResync }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1180px,94vw)] sm:max-w-[min(1180px,94vw)]">
        <DialogHeader>
          <DialogTitle>{name} · {t('manys.computer.title')}</DialogTitle>
          <DialogDescription>{t('manys.computer.viewer.hint')}</DialogDescription>
        </DialogHeader>
        {open && <ManyComputerDesktop manyId={manyId} human={wheel === 'you'} onResync={onResync} large />}
        <ManyComputerWheel wheel={wheel} busy={busy} onTake={onTake} onRelease={onRelease} />
      </DialogContent>
    </Dialog>
  );
}
