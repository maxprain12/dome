import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { validateEmail, validateName } from '@/lib/utils/validation';
import type { AccountIdentity } from '@/lib/account/completeWelcome';

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'onboarding.account_error_invalid_credentials',
  email_taken: 'onboarding.account_error_email_taken',
  weak_password: 'onboarding.account_error_weak_password',
  network_error: 'onboarding.account_error_network',
  exchange_failed: 'onboarding.account_error_provider_unreachable',
  supabase_not_configured: 'onboarding.account_error_not_configured',
};

interface AccountFormProps {
  onConnected: (identity: AccountIdentity) => Promise<void>;
  onLocal?: () => Promise<void>;
  onCancel?: () => void;
}

/** Shared authentication surface for first run and account settings. */
export default function AccountForm({ onConnected, onLocal, onCancel }: AccountFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const registering = mode === 'register';
  const nameError = submitted && registering && !validateName(name);
  const emailError = submitted && !validateEmail(email);
  const passwordError = submitted && (registering ? password.length < 8 : password.length === 0);

  async function run(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch { setError('welcome.save_error'); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setSubmitted(true);
    if (!validateEmail(email) || !password || (registering && (!validateName(name) || password.length < 8))) return;
    await run(async () => {
      let result;
      try {
        result = await window.electron.domeAuth.nativeLogin(email.trim(), password, registering, registering ? name.trim() : undefined);
      } catch { setError('onboarding.account_error_network'); return; }
      if (!result.success) {
        setError(AUTH_ERRORS[result.errorCode ?? ''] ?? 'onboarding.account_error_generic');
        return;
      }
      setPassword('');
      if (result.pendingConfirmation) { setConfirmation(true); return; }
      if (!result.connected) { setError('onboarding.account_error_generic'); return; }
      const account = { name: result.name, email: result.email ?? email.trim() };
      // Keep identity after authentication so a failed local save can retry without logging in twice.
      setIdentity(account);
      await onConnected(account);
    });
  }

  function switchMode() {
    setMode(registering ? 'login' : 'register');
    setError(null);
    setSubmitted(false);
    setPassword('');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">{t(identity ? 'welcome.ready_title' : registering ? 'welcome.register_title' : 'welcome.login_title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('welcome.account_description')}</p>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {identity ? (
        <Button disabled={busy} onClick={() => { void run(() => onConnected(identity)); }}>
          {busy && <Spinner data-icon="inline-start" />}{t('welcome.enter')}
        </Button>
      ) : confirmation ? (
        <div className="flex flex-col gap-4">
          <Alert><AlertDescription>{t('welcome.confirm_email', { email })}</AlertDescription></Alert>
          <Button disabled={busy} onClick={() => { setConfirmation(false); setMode('login'); setSubmitted(false); }}>{t('welcome.confirmed_login')}</Button>
        </div>
      ) : (
        <form noValidate onSubmit={(event) => { void authenticate(event); }} className="flex flex-col gap-5" aria-busy={busy}>
          <FieldGroup>
            {registering && <Field data-invalid={nameError}>
              <FieldLabel htmlFor={`${id}-name`}>{t('onboarding.account_name_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-name`} name="name" autoComplete="name" value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} aria-invalid={nameError} aria-describedby={nameError ? `${id}-name-error` : undefined} />
              {nameError && <FieldError id={`${id}-name-error`}>{t('onboarding.name_min_length')}</FieldError>}
            </Field>}
            <Field data-invalid={emailError}>
              <FieldLabel htmlFor={`${id}-email`}>{t('onboarding.account_email_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-email`} name="email" type="email" autoComplete="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailError} aria-describedby={emailError ? `${id}-email-error` : undefined} />
              {emailError && <FieldError id={`${id}-email-error`}>{t('onboarding.email_invalid')}</FieldError>}
            </Field>
            <Field data-invalid={passwordError}>
              <FieldLabel htmlFor={`${id}-password`}>{t('onboarding.account_password_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-password`} name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} aria-invalid={passwordError} aria-describedby={`${id}-password-hint`} />
              <FieldDescription id={`${id}-password-hint`}>{t(registering ? 'onboarding.password_min_length' : 'welcome.password_hint')}</FieldDescription>
              {passwordError && <FieldError>{t(registering ? 'onboarding.password_min_length' : 'welcome.password_required')}</FieldError>}
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{t(registering ? 'welcome.create_account' : 'welcome.sign_in')}</Button>
          <Button type="button" variant="link" disabled={busy} onClick={switchMode}>{t(registering ? 'welcome.have_account' : 'welcome.need_account')}</Button>
        </form>
      )}
      {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('access.close')}</Button>}
      {onLocal && !identity && <div className="flex flex-col gap-2 border-t pt-5">
        <Button variant="outline" disabled={busy} onClick={() => { void run(onLocal); }}>{t('welcome.continue_local')}</Button>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('welcome.local_hint')}</p>
      </div>}
    </div>
  );
}
