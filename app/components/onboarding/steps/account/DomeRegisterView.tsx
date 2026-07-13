
import { useTranslation } from 'react-i18next';
import type { ComponentProps } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { AlertCircleIcon, InformationCircleIcon, LockIcon, Mail01Icon, UserIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';

type InlineIconProps = Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>;
const Mail = (props: InlineIconProps) => <HugeiconsIcon icon={Mail01Icon} {...props} />;
const Lock = (props: InlineIconProps) => <HugeiconsIcon icon={LockIcon} {...props} />;
const User = (props: InlineIconProps) => <HugeiconsIcon icon={UserIcon} {...props} />;
const AlertCircle = (props: InlineIconProps) => <HugeiconsIcon icon={AlertCircleIcon} {...props} />;
const Info = (props: InlineIconProps) => <HugeiconsIcon icon={InformationCircleIcon} {...props} />;
interface DomeRegisterViewProps {
  name: string;
  email: string;
  password: string;
  touched: { name?: boolean; email?: boolean; password?: boolean };
  nameValid: boolean;
  emailValid: boolean;
  passwordValid: boolean;
  error: string | null;
  isSubmitting: boolean;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameBlur: () => void;
  onEmailBlur: () => void;
  onPasswordBlur: () => void;
  onSwitchToLogin: () => void;
}

export default function DomeRegisterView({
  name,
  email,
  password,
  touched,
  nameValid,
  emailValid,
  passwordValid,
  error,
  isSubmitting,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onNameBlur,
  onEmailBlur,
  onPasswordBlur,
  onSwitchToLogin,
}: DomeRegisterViewProps) {
  const { t } = useTranslation();

  const nameError = touched.name && !nameValid ? t('onboarding.name_min_length') : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {t('onboarding.register_title')}
        </h2>
        <p className="text-sm mt-1 text-muted-foreground">
          {t('onboarding.register_subtitle')}
        </p>
      </div>

      {error ? <Alert variant="destructive" role="note"><AlertCircle aria-hidden /><AlertDescription className="text-xs">{t(error)}</AlertDescription></Alert> : null}

      {isSubmitting ? (
        <Alert role="note"><Info aria-hidden /><AlertDescription className="text-xs">{t('onboarding.account_connecting')}</AlertDescription></Alert>
      ) : null}

      <Field className="gap-1.5" data-invalid={Boolean(nameError)}><FieldLabel htmlFor="account-name" className="text-xs">{t('onboarding.account_name_label')}</FieldLabel><div className="relative min-w-0"><span className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-center text-muted-foreground" aria-hidden><User className="size-4" /></span><Input id="account-name" className="pl-9" type="text" autoComplete="name" placeholder={t('onboarding.full_name_placeholder')} value={name} onChange={(e) => onNameChange(e.target.value)} onBlur={onNameBlur} disabled={isSubmitting} aria-invalid={Boolean(nameError) || undefined} /></div><FieldError className="text-xs">{nameError}</FieldError></Field>

      <Field className="gap-1.5" data-invalid={Boolean(touched.email && !emailValid ? t('onboarding.email_invalid') : undefined)}><FieldLabel htmlFor="account-email" className="text-xs">{t('onboarding.account_email_label')}</FieldLabel><div className="relative min-w-0"><span className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-center text-muted-foreground" aria-hidden><Mail className="size-4" /></span><Input id="account-email" className="pl-9" type="text" inputMode="email" autoComplete="email" placeholder={t('onboarding.email_placeholder')} value={email} onChange={(e) => onEmailChange(e.target.value)} onBlur={onEmailBlur} disabled={isSubmitting} aria-invalid={Boolean(touched.email && !emailValid ? t('onboarding.email_invalid') : undefined) || undefined} /></div><FieldError className="text-xs">{touched.email && !emailValid ? t('onboarding.email_invalid') : undefined}</FieldError></Field>

      <Field className="gap-1.5" data-invalid={Boolean(touched.password && !passwordValid ? t('onboarding.password_min_length') : undefined)}><FieldLabel htmlFor="account-password" className="text-xs">{t('onboarding.account_password_label')}</FieldLabel><div className="relative min-w-0"><span className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-center text-muted-foreground" aria-hidden><Lock className="size-4" /></span><Input id="account-password" className="pl-9" type="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={(e) => onPasswordChange(e.target.value)} onBlur={onPasswordBlur} disabled={isSubmitting} aria-invalid={Boolean(touched.password && !passwordValid ? t('onboarding.password_min_length') : undefined) || undefined} /></div><FieldError className="text-xs">{touched.password && !passwordValid ? t('onboarding.password_min_length') : undefined}</FieldError></Field>

      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onSwitchToLogin}
        className="text-xs text-left w-fit text-primary"
        disabled={isSubmitting}
      >
        {t('onboarding.register_switch_to_login')}
      </Button>
    </div>
  );
}
