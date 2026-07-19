import { useTranslation } from 'react-i18next';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EVENT_CARD_FONTS, fontStack } from './eventCardDesign';

export function EventCardFontSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const current = EVENT_CARD_FONTS.find((font) => font.id === value) ?? EVENT_CARD_FONTS[0];

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={current.id} onValueChange={(next) => { if (next) onChange(next); }}>
        <SelectTrigger className="w-full">
          <SelectValue>
            <span style={{ fontFamily: fontStack(current.id) }}>
              {t(`social.events.font_${current.id}`, { defaultValue: current.label })}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {EVENT_CARD_FONTS.map((font) => (
            <SelectItem key={font.id} value={font.id}>
              <span style={{ fontFamily: font.stack }}>
                {t(`social.events.font_${font.id}`, { defaultValue: font.label })}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
