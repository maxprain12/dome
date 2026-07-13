import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment';
import type { PendingPdfRegion } from '@/lib/store/useManyStore';

interface PdfRegionBannerProps {
  pending: PendingPdfRegion;
  onDismiss: () => void;
}

export default function PdfRegionBanner({ pending, onDismiss }: PdfRegionBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="mx-3 mb-2">
      <Attachment state="done" size="sm" className="w-full max-w-none border-primary/20 bg-primary/5">
        <AttachmentMedia variant="image">
          <img src={pending.imageDataUrl} alt="" />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{t('many.pdf_region_banner_title')}</AttachmentTitle>
          <AttachmentDescription>
            {pending.resourceTitle} · {t('many.pdf_region_banner_page', { page: pending.page })}
          </AttachmentDescription>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {t('many.pdf_region_banner_hint')}
          </p>
        </AttachmentContent>
        <AttachmentActions>
          <AttachmentAction
            type="button"
            aria-label={t('many.pdf_region_banner_dismiss')}
            onClick={onDismiss}
          >
            <HugeiconsIcon icon={Cancel01Icon} />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </div>
  );
}
