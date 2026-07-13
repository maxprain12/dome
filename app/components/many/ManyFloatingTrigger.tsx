import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ManyIcon from './ManyIcon';
import type { ManyStatus } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

interface ManyFloatingTriggerProps {
  onClick: () => void;
  status: ManyStatus;
  totalNotifications: number;
}

export default memo(function ManyFloatingTrigger({
  onClick,
  status,
  totalNotifications,
}: ManyFloatingTriggerProps) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      data-tour="many"
      onClick={onClick}
      size="icon"
      className={cn(
        'fixed bottom-6 right-6 z-(--z-max) size-14 rounded-full border-2 shadow-lg',
      )}
      aria-label={t('many.openChat')}
    >
      <ManyIcon size={32} />

      {totalNotifications > 0 ? (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 size-5 justify-center p-0 text-[11px]"
          aria-hidden
        >
          {totalNotifications > 9 ? '9+' : totalNotifications}
        </Badge>
      ) : null}

      {status !== 'idle' ? (
        <span
          className={cn(
            'absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-background',
            status === 'thinking' ? 'bg-warning opacity-80' : 'bg-success',
          )}
          aria-hidden
        />
      ) : null}
    </Button>
  );
});
