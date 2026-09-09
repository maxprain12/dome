import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { SocialProvider } from '@/components/social/socialTypes';

function asChecked(next: boolean | 'indeterminate'): boolean {
  return next === true;
}

function getRowClass(compact: boolean): string | undefined {
  return compact
    ? 'flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5'
    : undefined;
}

function getLabelContainerClass(compact: boolean): string {
  return compact ? 'min-w-0 text-xs' : 'flex flex-col gap-0.5';
}

function getFieldOrientation(compact: boolean): 'horizontal' | undefined {
  return compact ? undefined : 'horizontal';
}

function CommentsField({
  enabled,
  compact,
  onChange,
}: {
  enabled: boolean;
  compact: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field orientation={getFieldOrientation(compact)} className={getRowClass(compact)}>
      <Checkbox
        aria-label={t('social.settings.ig_comments_enabled')}
        checked={enabled}
        onCheckedChange={(next) => onChange(asChecked(next))}
      />
      <div className={getLabelContainerClass(compact)}>
        <FieldLabel>{t('social.settings.ig_comments_enabled')}</FieldLabel>
        <FieldDescription>{t('social.settings.ig_comments_hint')}</FieldDescription>
      </div>
    </Field>
  );
}

function DmField({
  isX,
  enabled,
  compact,
  onChange,
}: {
  isX: boolean;
  enabled: boolean;
  compact: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const enabledKey = isX
    ? 'social.settings.x_dm_enabled'
    : 'social.settings.ig_messages_enabled';
  const hintKey = isX ? 'social.settings.x_dm_hint' : 'social.settings.ig_messages_hint';
  return (
    <Field orientation={getFieldOrientation(compact)} className={getRowClass(compact)}>
      <Checkbox
        aria-label={t(enabledKey)}
        checked={enabled}
        onCheckedChange={(next) => onChange(asChecked(next))}
      />
      <div className={getLabelContainerClass(compact)}>
        <FieldLabel>{t(enabledKey)}</FieldLabel>
        <FieldDescription>{t(hintKey)}</FieldDescription>
      </div>
    </Field>
  );
}

export function SocialMessagingFlags({
  provider,
  commentsEnabled,
  dmEnabled,
  onCommentsChange,
  onDmChange,
  compact = false,
}: {
  provider: SocialProvider;
  commentsEnabled: boolean;
  dmEnabled: boolean;
  onCommentsChange: (next: boolean) => void;
  onDmChange: (next: boolean) => void;
  compact?: boolean;
}) {
  const showComments = provider === 'instagram';
  const showDm = provider === 'instagram' || provider === 'x';
  if (!showComments && !showDm) return null;

  return (
    <div className="flex flex-col gap-3">
      {showComments ? (
        <CommentsField
          enabled={commentsEnabled}
          compact={compact}
          onChange={onCommentsChange}
        />
      ) : null}
      {showDm ? (
        <DmField
          isX={provider === 'x'}
          enabled={dmEnabled}
          compact={compact}
          onChange={onDmChange}
        />
      ) : null}
    </div>
  );
}
