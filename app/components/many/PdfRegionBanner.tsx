import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PendingPdfRegion } from '@/lib/store/useManyStore';

interface PdfRegionBannerProps {
  pending: PendingPdfRegion;
  onDismiss: () => void;
}

export default function PdfRegionBanner({ pending, onDismiss }: PdfRegionBannerProps) {
  const { t } = useTranslation();

  return (
    <div
      className="mx-3 mb-2 flex items-start gap-3 rounded-xl border px-3 py-2.5"
      style={{
        borderColor: 'var(--border)',
        background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-secondary))',
      }}
    >
      <div
        className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border"
        style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
      >
        <img src={pending.imageDataUrl} alt="" className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[var(--primary-text)]">{t('many.pdf_region_banner_title')}</p>
        <p className="mt-0.5 truncate text-[12px] text-[var(--secondary-text)]">
          {pending.resourceTitle} · {t('many.pdf_region_banner_page', { page: pending.page })}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-[var(--tertiary-text)]">{t('many.pdf_region_banner_hint')}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg p-1.5 text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--primary-text)]"
        onClick={onDismiss}
        aria-label={t('many.pdf_region_banner_dismiss')}
        title={t('many.pdf_region_banner_dismiss')}
      >
        <X size={16} />
      </button>
    </div>
  );
}
