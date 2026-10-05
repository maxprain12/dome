import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { validateEmail, validateName } from '@/lib/utils/validation';

const AUTH_ERRORS: Record<string, string> = {
  invalid_credentials: 'account.errors.invalid_credentials',
  email_taken: 'account.errors.email_taken',
  weak_password: 'account.errors.weak_password',
  network_error: 'account.errors.network',
  exchange_failed: 'account.errors.provider_unreachable',
  supabase_not_configured: 'account.errors.not_configured',
};

export interface AccountIdentity {
  name?: string | null;
  email?: string | null;
}

interface AccountFormProps {
  onConnected: (identity: AccountIdentity) => Promise<void>;
  onCancel?: () => void;
}

/** Sign-in and registration for the Dome account, shown in Settings. */
export default function AccountForm({ onConnected, onCancel }: AccountFormProps) {
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
    catch { setError('account.save_error'); }
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
      } catch { setError('account.errors.network'); return; }
      if (!result.success) {
        setError(AUTH_ERRORS[result.errorCode ?? ''] ?? 'account.errors.generic');
        return;
      }
      setPassword('');
      if (result.pendingConfirmation) { setConfirmation(true); return; }
      if (!result.connected) { setError('account.errors.generic'); return; }
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
        <h2 className="text-2xl font-semibold tracking-tight">{t(identity ? 'account.ready_title' : registering ? 'account.register_title' : 'account.login_title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('account.description')}</p>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{t(error)}</AlertDescription></Alert>}
      {identity ? (
        <Button disabled={busy} onClick={() => { void run(() => onConnected(identity)); }}>
          {busy && <Spinner data-icon="inline-start" />}{t('account.continue')}
        </Button>
      ) : confirmation ? (
        <div className="flex flex-col gap-4">
          <Alert><AlertDescription>{t('account.confirm_email', { email })}</AlertDescription></Alert>
          <Button disabled={busy} onClick={() => { setConfirmation(false); setMode('login'); setSubmitted(false); }}>{t('account.confirmed_login')}</Button>
        </div>
      ) : (
        <form noValidate onSubmit={(event) => { void authenticate(event); }} className="flex flex-col gap-5" aria-busy={busy}>
          <FieldGroup>
            {registering && <Field data-invalid={nameError}>
              <FieldLabel htmlFor={`${id}-name`}>{t('account.name_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-name`} name="name" autoComplete="name" value={name} maxLength={100} disabled={busy} onChange={(e) => setName(e.target.value)} aria-invalid={nameError} aria-describedby={nameError ? `${id}-name-error` : undefined} />
              {nameError && <FieldError id={`${id}-name-error`}>{t('account.name_min_length')}</FieldError>}
            </Field>}
            <Field data-invalid={emailError}>
              <FieldLabel htmlFor={`${id}-email`}>{t('account.email_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-email`} name="email" type="email" autoComplete="email" value={email} disabled={busy} onChange={(e) => setEmail(e.target.value)} aria-invalid={emailError} aria-describedby={emailError ? `${id}-email-error` : undefined} />
              {emailError && <FieldError id={`${id}-email-error`}>{t('account.email_invalid')}</FieldError>}
            </Field>
            <Field data-invalid={passwordError}>
              <FieldLabel htmlFor={`${id}-password`}>{t('account.password_label')}</FieldLabel>
              <Input className="h-10" id={`${id}-password`} name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} aria-invalid={passwordError} aria-describedby={`${id}-password-hint`} />
              <FieldDescription id={`${id}-password-hint`}>{t(registering ? 'account.password_min_length' : 'account.password_hint')}</FieldDescription>
              {passwordError && <FieldError>{t(registering ? 'account.password_min_length' : 'account.password_required')}</FieldError>}
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" disabled={busy}>{busy && <Spinner data-icon="inline-start" />}{t(registering ? 'account.create' : 'account.sign_in')}</Button>
          <Button type="button" variant="link" disabled={busy} onClick={switchMode}>{t(registering ? 'account.have_account' : 'account.need_account')}</Button>
        </form>
      )}
      {onCancel && <Button variant="ghost" disabled={busy} onClick={onCancel}>{t('access.close')}</Button>}
    </div>
  );
}
