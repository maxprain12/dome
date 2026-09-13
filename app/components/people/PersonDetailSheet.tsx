import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailCloseProvider } from '@/components/shared/DetailModal';

export function PersonDetailSheet({
  open,
  onClose,
  title,
  loading = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  loading?: boolean;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="supports-backdrop-filter:backdrop-blur-none"
        className="h-full min-h-0 w-full gap-0 overflow-hidden overscroll-contain p-0 contain-paint isolate transition-[opacity] sm:max-w-2xl"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{t('people.detail_empty_description')}</SheetDescription>
        <DetailCloseProvider onClose={onClose}>
          {loading ? (
            <div className="flex flex-1 flex-col gap-3 p-5" aria-busy="true" aria-label={t('people.loading')}>
              <Skeleton className="h-12 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
          )}
        </DetailCloseProvider>
      </SheetContent>
    </Sheet>
  );
}
