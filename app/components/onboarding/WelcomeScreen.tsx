import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccountForm from '@/components/account/AccountForm';
import { completeWelcome, type AccountIdentity } from '@/lib/account/completeWelcome';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';

export default function WelcomeScreen({ onComplete }: { onComplete: () => void }) {
  const { t, i18n } = useTranslation();
  const [session, setSession] = useState<'checking' | 'connected' | 'local'>('checking');
  useEffect(() => {
    let active = true;
    const read = window.electron?.domeAuth?.getSession?.() ?? Promise.resolve({ connected: false });
    read.then((value) => { if (active) setSession(value.connected ? 'connected' : 'local'); }).catch(() => { if (active) setSession('local'); });
    return () => { active = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function finish(identity?: AccountIdentity) {
    await completeWelcome(identity);
    onComplete();
  }
  async function enter() {
    setBusy(true);
    setError(false);
    try { await finish(); } catch { setError(true); } finally { setBusy(false); }
  }
  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between gap-6 px-8 pb-6 pt-12 lg:px-14">
        <span className="text-2xl font-semibold tracking-tight">dome.</span>
        <Select value={i18n.language.split('-')[0]} onValueChange={(value) => { if (value) changeLanguage(value as SupportedLanguage); }}>
          <SelectTrigger aria-label={t('onboarding.language_title')}><SelectValue>{t(`onboarding.language_native.${i18n.language.split('-')[0]}`)}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{SUPPORTED_LANGUAGES.map((lang) => <SelectItem key={lang} value={lang}>{t(`onboarding.language_native.${lang}`)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </header>
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-8 py-10 md:grid-cols-[1.15fr_1fr] lg:gap-24 lg:px-14">
        <section className="flex flex-col items-start gap-7" aria-labelledby="welcome-title">
          <img src="/many.png" alt="" className="size-12 object-contain md:size-20 lg:size-28" />
          <h1 id="welcome-title" className="max-w-lg text-balance text-3xl md:text-4xl font-semibold leading-[1.08] tracking-tight lg:text-6xl">{t('welcome.title')}</h1>
          <p className="max-w-md text-base leading-relaxed text-muted-foreground">{t('welcome.description')}</p>
          <dl className="mt-4 hidden max-w-md flex-col md:flex gap-5">
            {(['collect', 'connect', 'create'] as const).map((item) => <div key={item} className="border-l-2 border-primary/20 pl-4">
              <dt className="text-sm font-medium">{t(`welcome.${item}_title`)}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`welcome.${item}_description`)}</dd>
            </div>)}
          </dl>
        </section>
        <section className="w-full max-w-md justify-self-center rounded-2xl bg-muted/40 p-6 lg:p-8" aria-label={t('welcome.account')}>
          {session === 'checking' ? <div role="status" className="flex items-center gap-3 py-12"><Spinner />{t('common.loading')}</div> : session === 'connected' ? <div className="flex flex-col gap-5">
            <h2 className="text-2xl font-semibold tracking-tight">{t('welcome.ready_title')}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('welcome.local_hint')}</p>
            {error && <Alert variant="destructive"><AlertDescription>{t('welcome.save_error')}</AlertDescription></Alert>}
            <Button size="lg" disabled={busy} onClick={() => { void enter(); }}>{busy && <Spinner />}{t('welcome.enter')}</Button>
          </div> : <AccountForm onConnected={finish} onLocal={() => finish()} />}
        </section>
      </div>
      <footer className="px-8 py-6 text-xs text-muted-foreground lg:px-14">{t('welcome.footer')}</footer>
    </main>
  );
}
