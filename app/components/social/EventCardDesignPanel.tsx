import { useTranslation } from 'react-i18next';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { EventCardFontSelect } from './EventCardFontSelect';
import {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  DEFAULT_LABEL,
  EVENT_CARD_FONT_WEIGHTS,
  EVENT_CARD_LAYOUTS,
  normalizeHex,
} from './eventCardDesign';
import type { EventCardDesign, EventCardFontWeight, EventCardLayout, EventCardQrStyle } from './socialTypes';

function DesignColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const hex = normalizeHex(value, fallback);
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-input/20 px-2 text-left text-sm"
            />
          }
        >
          <span
            className="size-5 shrink-0 rounded-sm border border-border"
            style={{ backgroundColor: hex }}
            aria-hidden
          />
          <span className="font-mono uppercase">{hex}</span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <HexColorPicker color={hex} onChange={(next) => onChange(normalizeHex(next, fallback))} />
          <div className="mt-2">
            <HexColorInput
              color={hex}
              prefixed
              onChange={(next) => onChange(normalizeHex(next, fallback))}
              className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-sm uppercase"
            />
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function WeightSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: EventCardFontWeight;
  onChange: (value: EventCardFontWeight) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next && (EVENT_CARD_FONT_WEIGHTS as string[]).includes(next)) {
            onChange(next as EventCardFontWeight);
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVENT_CARD_FONT_WEIGHTS.map((weight) => (
            <SelectItem key={weight} value={weight}>
              {weight}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function LayoutThumb({ layout }: { layout: EventCardLayout }) {
  if (layout === 'hero') {
    return (
      <div className="flex h-10 flex-col overflow-hidden rounded border border-border/80 bg-muted">
        <div className="h-5 bg-foreground/20" />
        <div className="flex flex-1 flex-col justify-center gap-0.5 px-1">
          <div className="h-1 w-3/4 rounded-sm bg-foreground/35" />
          <div className="h-1 w-1/2 rounded-sm bg-foreground/20" />
        </div>
      </div>
    );
  }
  if (layout === 'split_qr') {
    return (
      <div className="flex h-10 overflow-hidden rounded border border-border/80 bg-muted">
        <div className="flex flex-1 flex-col justify-center gap-0.5 px-1">
          <div className="h-1 w-full rounded-sm bg-foreground/35" />
          <div className="h-1 w-2/3 rounded-sm bg-foreground/20" />
        </div>
        <div className="m-1 size-6 shrink-0 rounded-sm bg-foreground/25" />
      </div>
    );
  }
  if (layout === 'compact') {
    return (
      <div className="flex h-10 items-center gap-1 overflow-hidden rounded border border-border/80 bg-muted px-1">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-1 w-full rounded-sm bg-foreground/35" />
          <div className="h-1 w-1/2 rounded-sm bg-foreground/20" />
        </div>
        <div className="size-5 shrink-0 rounded-sm bg-foreground/25" />
      </div>
    );
  }
  return (
    <div className="flex h-10 flex-col overflow-hidden rounded border border-border/80 bg-muted">
      <div className="h-3 bg-foreground/15" />
      <div className="flex flex-1 flex-col justify-center gap-0.5 px-1">
        <div className="h-1 w-3/4 rounded-sm bg-foreground/35" />
        <div className="mx-auto mt-0.5 size-2.5 rounded-sm bg-foreground/25" />
      </div>
    </div>
  );
}

export function EventCardDesignPanel({
  design,
  onChange,
}: {
  design: EventCardDesign;
  onChange: (patch: Partial<EventCardDesign>) => void;
}) {
  const { t } = useTranslation();
  const layout = design.layout ?? 'classic';
  const qrStyle = design.qrStyle ?? 'rounded';
  const showQr = design.showQr !== false;

  return (
    <FieldGroup className="gap-8">
      <FieldSet>
        <FieldLegend>{t('social.events.section_layout')}</FieldLegend>
        <div className="grid grid-cols-2 gap-2 @[36rem]/event-cards:grid-cols-4">
          {EVENT_CARD_LAYOUTS.map((id) => {
            const selected = layout === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange({ layout: id })}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <LayoutThumb layout={id} />
                <span className="text-xs font-medium">
                  {t(`social.events.layout_${id}`)}
                </span>
              </button>
            );
          })}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t('social.events.section_identity')}</FieldLegend>
        <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
          <Field>
            <FieldLabel>{t('social.events.brand')}</FieldLabel>
            <Input
              value={design.brandName ?? ''}
              onChange={(e) => onChange({ brandName: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>{t('social.events.logo')}</FieldLabel>
            <Input
              value={design.logoUrl ?? ''}
              onChange={(e) => onChange({ logoUrl: e.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field className="@[36rem]/event-cards:col-span-2">
            <FieldLabel>{t('social.events.cover')}</FieldLabel>
            <Input
              value={design.coverUrl ?? ''}
              onChange={(e) => onChange({ coverUrl: e.target.value })}
              placeholder="https://"
            />
            <p className="text-xs text-muted-foreground">{t('social.events.cover_hint')}</p>
          </Field>
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t('social.events.section_typography')}</FieldLegend>
        <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
          <EventCardFontSelect
            label={t('social.events.title_font')}
            value={design.titleFont ?? 'sans'}
            onChange={(titleFont) => onChange({ titleFont })}
          />
          <WeightSelect
            label={t('social.events.title_weight')}
            value={design.titleWeight ?? '600'}
            onChange={(titleWeight) => onChange({ titleWeight })}
          />
          <EventCardFontSelect
            label={t('social.events.body_font')}
            value={design.bodyFont ?? 'sans'}
            onChange={(bodyFont) => onChange({ bodyFont })}
          />
          <WeightSelect
            label={t('social.events.body_weight')}
            value={design.bodyWeight ?? '400'}
            onChange={(bodyWeight) => onChange({ bodyWeight })}
          />
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t('social.events.section_colors')}</FieldLegend>
        <div className="grid gap-4 @[36rem]/event-cards:grid-cols-3">
          <DesignColorField
            label={t('social.events.color_background')}
            value={design.backgroundColor ?? DEFAULT_BACKGROUND}
            fallback={DEFAULT_BACKGROUND}
            onChange={(backgroundColor) => onChange({ backgroundColor, primaryColor: backgroundColor })}
          />
          <DesignColorField
            label={t('social.events.color_foreground')}
            value={design.foregroundColor ?? DEFAULT_FOREGROUND}
            fallback={DEFAULT_FOREGROUND}
            onChange={(foregroundColor) => onChange({ foregroundColor })}
          />
          <DesignColorField
            label={t('social.events.color_label')}
            value={design.labelColor ?? DEFAULT_LABEL}
            fallback={DEFAULT_LABEL}
            onChange={(labelColor) => onChange({ labelColor, secondaryColor: labelColor })}
          />
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{t('social.events.section_qr')}</FieldLegend>
        <div className="grid gap-4 @[36rem]/event-cards:grid-cols-2">
          <Field orientation="horizontal" className="items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <FieldLabel className="m-0">{t('social.events.show_qr')}</FieldLabel>
            <Switch checked={showQr} onCheckedChange={(checked) => onChange({ showQr: checked })} />
          </Field>
          <Field>
            <FieldLabel>{t('social.events.qr_style')}</FieldLabel>
            <Select
              value={qrStyle}
              onValueChange={(next) => {
                if (next === 'square' || next === 'rounded') onChange({ qrStyle: next as EventCardQrStyle });
              }}
              disabled={!showQr}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rounded">{t('social.events.qr_style_rounded')}</SelectItem>
                <SelectItem value="square">{t('social.events.qr_style_square')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldSet>
    </FieldGroup>
  );
}
