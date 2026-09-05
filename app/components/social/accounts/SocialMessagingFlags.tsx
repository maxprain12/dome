import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import type { SocialProvider } from '@/components/social/socialTypes';

function asChecked(next: boolean | 'indeterminate'): boolean {
  return next === true;
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
  const { t } = useTranslation();
  const showComments = provider === 'instagram';
  const showDm = provider === 'instagram' || provider === 'x';
  if (!showComments && !showDm) return null;

  const rowClass = compact
    ? 'flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5'
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {showComments ? (
        <Field orientation={compact ? undefined : 'horizontal'} className={rowClass}>
          <Checkbox
            aria-label={t('social.settings.ig_comments_enabled')}
            checked={commentsEnabled}
            onCheckedChange={(next) => {
              onCommentsChange(asChecked(next));
            }}
          />
          <div className={compact ? 'min-w-0 text-xs' : 'flex flex-col gap-0.5'}>
            <FieldLabel>{t('social.settings.ig_comments_enabled')}</FieldLabel>
            <FieldDescription>{t('social.settings.ig_comments_hint')}</FieldDescription>
          </div>
        </Field>
      ) : null}
      {showDm ? (
        <Field orientation={compact ? undefined : 'horizontal'} className={rowClass}>
          <Checkbox
            aria-label={
              provider === 'x'
                ? t('social.settings.x_dm_enabled')
                : t('social.settings.ig_messages_enabled')
            }
            checked={dmEnabled}
            onCheckedChange={(next) => {
              onDmChange(asChecked(next));
            }}
          />
          <div className={compact ? 'min-w-0 text-xs' : 'flex flex-col gap-0.5'}>
            <FieldLabel>
              {provider === 'x'
                ? t('social.settings.x_dm_enabled')
                : t('social.settings.ig_messages_enabled')}
            </FieldLabel>
            <FieldDescription>
              {provider === 'x'
                ? t('social.settings.x_dm_hint')
                : t('social.settings.ig_messages_hint')}
            </FieldDescription>
          </div>
        </Field>
      ) : null}
    </div>
  );
}
