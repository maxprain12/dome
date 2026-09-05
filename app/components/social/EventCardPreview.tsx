import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EVENT_CARD_QR_COLORS } from '@/lib/ui/palettes';
import { cn } from '@/lib/utils';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  DEFAULT_LABEL,
  EVENT_CARD_COVER_ASPECT,
  EVENT_CARD_COVER_HEIGHT,
  EVENT_CARD_COVER_WIDTH,
  fontStack,
  normalizeEventCardDesign,
  normalizeHex,
} from './eventCardDesign';
import type { EventCardDesign, EventCardFontWeight, EventCardLayout } from './socialTypes';

/** Cover strip locked to 1125×294 so Wallet banners are not cropped. */
export function EventCardCoverStrip({
  coverUrl,
  labelColor,
  placeholder,
  placeholderBackground,
  className,
}: {
  coverUrl?: string | null;
  labelColor: string;
  placeholder: string;
  /** Solid fill when there is no cover (list cards). Defaults to a light overlay. */
  placeholderBackground?: string;
  className?: string;
}) {
  if (coverUrl) {
    return (
      <div className={cn('w-full overflow-hidden', className)} style={{ aspectRatio: EVENT_CARD_COVER_ASPECT }}>
        <img
          src={coverUrl}
          alt=""
          width={EVENT_CARD_COVER_WIDTH}
          height={EVENT_CARD_COVER_HEIGHT}
          className="size-full object-cover object-center"
        />
      </div>
    );
  }
  return (
    <div
      className={cn('flex w-full items-center justify-center text-xs opacity-80', className)}
      style={{
        aspectRatio: EVENT_CARD_COVER_ASPECT,
        backgroundColor: placeholderBackground ?? 'color-mix(in oklab, black 18%, transparent)',
        color: labelColor,
      }}
    >
      {placeholder}
    </div>
  );
}

export type EventCardPreviewForm = {
  title: string;
  description: string | null;
  organizer: string | null;
  startsAt: string;
  venueName: string | null;
  address: string | null;
  ctaLabel: string | null;
  design: EventCardDesign;
};

function useQrDataUrl(url: string | null, enabled: boolean) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !url) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(url, {
      margin: 1,
      width: 160,
      errorCorrectionLevel: 'M',
      color: { dark: EVENT_CARD_QR_COLORS.dark, light: EVENT_CARD_QR_COLORS.light },
    })
      .then((next) => {
        if (!cancelled) setDataUrl(next);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, enabled]);

  return dataUrl;
}

function QrBlock({
  dataUrl,
  rounded,
  label,
  placeholder,
}: {
  dataUrl: string | null;
  rounded: boolean;
  label: string;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          'flex size-28 items-center justify-center border border-border bg-white p-1.5',
          rounded ? 'rounded-xl' : 'rounded-sm',
        )}
      >
        {dataUrl ? (
          <img src={dataUrl} alt={label} className={cn('size-full', rounded ? 'rounded-lg' : 'rounded-none')} />
        ) : (
          <div
            className={cn(
              'flex size-full items-center justify-center bg-neutral-100 px-2 text-center text-[10px] leading-snug text-neutral-500',
              rounded ? 'rounded-lg' : 'rounded-none',
            )}
          >
            {placeholder}
          </div>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-wide opacity-70">{label}</span>
    </div>
  );
}

type PreviewTone = {
  background: string;
  foreground: string;
  label: string;
  titleFamily: string;
  bodyFamily: string;
  titleWeight: EventCardFontWeight;
  bodyWeight: EventCardFontWeight;
};

/** Venue / address / description / CTA — extracted for S3776. */
function EventCardMeta({
  form,
  tone,
}: {
  form: EventCardPreviewForm;
  tone: PreviewTone;
}) {
  const { foreground, label, background, bodyFamily, bodyWeight } = tone;
  const venueLine = form.venueName || form.address;
  const ctaWeight = bodyWeight === '400' ? '500' : bodyWeight;

  return (
    <>
      <p className="text-sm" style={{ color: foreground, fontFamily: bodyFamily, fontWeight: bodyWeight }}>
        {new Date(form.startsAt).toLocaleString()}
      </p>
      {venueLine ? (
        <p className="text-sm" style={{ color: foreground, fontFamily: bodyFamily, fontWeight: bodyWeight }}>
          {venueLine}
        </p>
      ) : null}
      {form.description ? (
        <p
          className="text-sm opacity-80"
          style={{ color: foreground, fontFamily: bodyFamily, fontWeight: bodyWeight }}
        >
          {form.description}
        </p>
      ) : null}
      {form.ctaLabel ? (
        <span
          className="inline-flex w-fit rounded-md px-3 py-1.5 text-sm"
          style={{
            backgroundColor: label,
            color: background,
            fontFamily: bodyFamily,
            fontWeight: ctaWeight,
          }}
        >
          {form.ctaLabel}
        </span>
      ) : null}
    </>
  );
}

/** Apple / Google Wallet status badges — extracted for S3776. */
function EventCardWalletRow({
  wallet,
  labelColor,
  setupRequired,
}: {
  wallet: { appleConfigured: boolean; googleConfigured: boolean };
  labelColor: string;
  setupRequired: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="border-current/30 bg-transparent" style={{ color: labelColor }}>
        Apple Wallet · {wallet.appleConfigured ? 'OK' : setupRequired}
      </Badge>
      <Badge variant="outline" className="border-current/30 bg-transparent" style={{ color: labelColor }}>
        Google Wallet · {wallet.googleConfigured ? 'OK' : setupRequired}
      </Badge>
    </div>
  );
}

/** Logo + brand label — extracted for S3776. */
function EventCardBrandRow({
  logoUrl,
  brand,
  labelColor,
  bodyFamily,
}: {
  logoUrl?: string | null;
  brand: string;
  labelColor: string;
  bodyFamily: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="size-8 shrink-0 rounded-md object-cover ring-1 ring-white/20"
        />
      ) : null}
      <CardDescription style={{ color: labelColor, fontFamily: bodyFamily }}>{brand}</CardDescription>
    </div>
  );
}

const PREVIEW_CARD_CLASS =
  'order-1 self-start overflow-hidden border-0 ring-0 @[70rem]/event-cards:sticky @[70rem]/event-cards:top-0 @[70rem]/event-cards:order-2';

/** Classic / hero / compact body (non-split) — extracted for S3776. */
function EventCardClassicBody({
  layout,
  meta,
  qr,
  walletRow,
  showQr,
  publicUrl,
  labelColor,
}: {
  layout: EventCardLayout;
  meta: ReactNode;
  qr: ReactNode;
  walletRow: ReactNode;
  showQr: boolean;
  publicUrl: string | null;
  labelColor: string;
}) {
  const compact = layout === 'compact';

  return (
    <CardContent className={cn('flex flex-col gap-3', compact && 'gap-2 pt-0')}>
      {compact ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">{meta}</div>
          {qr}
        </div>
      ) : (
        <>
          {meta}
          {qr ? <div className="flex justify-center py-1">{qr}</div> : null}
        </>
      )}
      {walletRow}
      {!showQr && publicUrl ? (
        <p className="break-all text-xs opacity-70" style={{ color: labelColor }}>
          {publicUrl}
        </p>
      ) : null}
    </CardContent>
  );
}

export function EventCardPreview({
  form,
  wallet,
  publicUrl,
  className,
}: {
  form: EventCardPreviewForm;
  wallet: { appleConfigured: boolean; googleConfigured: boolean };
  publicUrl: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const design = normalizeEventCardDesign(form.design);
  const background = normalizeHex(design.backgroundColor, DEFAULT_BACKGROUND);
  const foreground = normalizeHex(design.foregroundColor, DEFAULT_FOREGROUND);
  const label = normalizeHex(design.labelColor, DEFAULT_LABEL);
  const titleFamily = fontStack(design.titleFont);
  const bodyFamily = fontStack(design.bodyFont);
  const showQr = design.showQr !== false;
  const qrDataUrl = useQrDataUrl(publicUrl, showQr);
  const rounded = design.qrStyle !== 'square';
  const layout = design.layout ?? 'classic';
  const brand = design.brandName || form.organizer || t('social.events.brand');
  const tone: PreviewTone = {
    background,
    foreground,
    label,
    titleFamily,
    bodyFamily,
    titleWeight: design.titleWeight ?? '600',
    bodyWeight: design.bodyWeight ?? '400',
  };

  const cover = (
    <EventCardCoverStrip
      coverUrl={design.coverUrl}
      labelColor={label}
      placeholder={t('social.events.preview_cover_placeholder')}
    />
  );

  const qrPlaceholder = publicUrl
    ? t('social.events.qr_loading')
    : t('social.events.qr_draft_placeholder');
  const qr = showQr ? (
    <QrBlock
      dataUrl={qrDataUrl}
      rounded={rounded}
      label={t('social.events.qr_label')}
      placeholder={qrPlaceholder}
    />
  ) : null;

  const meta = <EventCardMeta form={form} tone={tone} />;
  const walletRow = (
    <EventCardWalletRow
      wallet={wallet}
      labelColor={label}
      setupRequired={t('social.events.setup_required')}
    />
  );
  const brandRow = (
    <EventCardBrandRow
      logoUrl={design.logoUrl}
      brand={brand}
      labelColor={label}
      bodyFamily={bodyFamily}
    />
  );
  const title = (
    <CardTitle
      className={cn(layout === 'compact' ? 'text-lg' : 'text-xl')}
      style={{
        color: foreground,
        fontFamily: titleFamily,
        fontWeight: design.titleWeight,
      }}
    >
      {form.title || t('social.events.preview_title')}
    </CardTitle>
  );

  if (layout === 'split_qr') {
    return (
      <Card
        className={cn(PREVIEW_CARD_CLASS, className)}
        style={{ backgroundColor: background, color: foreground }}
      >
        {cover}
        <div className="grid grid-cols-[1fr_auto] gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-2">
            {brandRow}
            {title}
            {meta}
            {walletRow}
          </div>
          {qr}
        </div>
      </Card>
    );
  }

  return (
    <Card
      className={cn(PREVIEW_CARD_CLASS, className)}
      style={{ backgroundColor: background, color: foreground }}
    >
      {cover}
      <CardHeader className={layout === 'compact' ? 'gap-1.5 pb-2' : undefined}>
        {brandRow}
        {title}
      </CardHeader>
      <EventCardClassicBody
        layout={layout}
        meta={meta}
        qr={qr}
        walletRow={walletRow}
        showQr={showQr}
        publicUrl={publicUrl}
        labelColor={label}
      />
    </Card>
  );
}
