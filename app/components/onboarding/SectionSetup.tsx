import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, CheckmarkCircle02Icon, LockIcon, CloudIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useCloudEntitlements } from '@/lib/hooks/useCloudEntitlements';
import { guideAction, reviewedStepKey } from '@/lib/onboarding/sectionActions';
import type { SectionGuide } from '@/lib/onboarding/sectionGuides';

interface SectionSetupProps {
  guide: SectionGuide;
  selected: number;
  seen: Record<string, boolean>;
  busy: boolean;
  error: boolean;
  name: string;
  onSelect: (step: number) => void;
  onRead: () => void;
  onAction: () => void;
  onClose: () => void;
  onAccount: () => void;
}

export default function SectionSetup({ guide, selected, seen, busy, error, name, onSelect, onRead, onAction, onClose, onAccount }: SectionSetupProps) {
  const { t } = useTranslation();
  const access = useCloudEntitlements();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const reviewed = guide.stepKeys.filter((_, i) => seen[reviewedStepKey(guide.key, i)]).length;
  const cloudFeature = guide.key === 'social' ? 'social_cloud' : guide.key === 'pipelines' ? 'pipelines_cloud' : 'cloud_sync';
  const cloudAllowed = !access.loading && !access.error && access.features.includes(cloudFeature);
  const otherSteps = guide.stepKeys.map((_, i) => i).filter((i) => i !== selected);

  return <section data-section-onboarding className="@container/setup flex-1 overflow-y-auto bg-background" aria-labelledby={`setup-${guide.key}`}>
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-6 py-9 @min-[850px]/setup:px-14 @min-[850px]/setup:py-14">
      <header className="flex flex-col items-start justify-between gap-5 @min-[640px]/setup:flex-row">
        <div>
          <p className="mb-2 text-sm text-muted-foreground">{name ? t('sectionGuide.setup.hello', { name: name.split(' ')[0] }) : t('sectionGuide.setup.welcome')}</p>
          <h1 ref={heading} tabIndex={-1} id={`setup-${guide.key}`} className="text-balance text-3xl font-medium leading-tight tracking-tight outline-none">{t(guide.titleKey)}</h1>
          <p className="mt-2 text-lg leading-relaxed text-muted-foreground">{t('sectionGuide.setup.subtitle')}</p>
        </div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>{t('sectionGuide.setup.skip')}</Button>
      </header>
      {error && <Alert variant="destructive"><AlertDescription>{t('sectionGuide.save_error')}</AlertDescription></Alert>}
      <div className="grid items-stretch gap-2 rounded-2xl bg-muted/40 p-1.5 @min-[640px]/setup:grid-cols-2">
        <Card className="gap-0 overflow-hidden shadow-none">
          <div className="flex h-44 items-center justify-center px-8 pt-4 @min-[850px]/setup:h-56" aria-hidden>
            <img src="/onboarding/workspace-notebook.png" alt="" className="h-full w-full object-contain" />
          </div>
          <CardHeader className="pt-5">
            <CardTitle>{t(`sectionGuide.${guide.key}.task${selected + 1}`)}</CardTitle>
            <CardDescription>{t(guide.stepKeys[selected])}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-5 pt-6">
            <ol className="flex flex-col gap-4">
              {guide.stepKeys.map((key, i) => {
                const done = Boolean(seen[reviewedStepKey(guide.key, i)]);
                return <li key={key}><button type="button" disabled={busy} onClick={() => onSelect(i)} aria-current={i === selected ? 'step' : undefined} className="flex w-full items-start gap-3 rounded-md text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">
                  {done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mt-0.5 size-4 shrink-0 text-primary" aria-label={t('sectionGuide.setup.reviewed')} /> : <span className="mt-0.5 size-4 shrink-0 rounded-full border border-dashed border-muted-foreground" aria-hidden />}
                  <span className={cn('text-sm leading-relaxed', i !== selected && 'text-muted-foreground')}>{t(`sectionGuide.${guide.key}.task${i + 1}`)}</span>
                </button></li>;
              })}
            </ol>
            <p className="text-xs text-muted-foreground" aria-live="polite">{t('sectionGuide.setup.progress', { count: reviewed, total: guide.stepKeys.length })}</p>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2 pt-6">
            <Button disabled={busy} onClick={onAction}>{busy && <Spinner data-icon="inline-start" />}{t(`sectionGuide.setup.actions.${guideAction(guide.key, selected)}`)}<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></Button>
            <Button variant="ghost" disabled={busy || Boolean(seen[reviewedStepKey(guide.key, selected)])} onClick={onRead}>{t('sectionGuide.setup.mark_read')}</Button>
          </CardFooter>
        </Card>
        <div className="grid gap-2">
          {otherSteps.map((step) => <Card key={step} className="gap-4 shadow-none">
            <CardHeader><CardTitle>{t(`sectionGuide.${guide.key}.task${step + 1}`)}</CardTitle><CardDescription>{t(guide.stepKeys[step])}</CardDescription></CardHeader>
            <CardFooter className="mt-auto justify-between gap-3">
              {seen[reviewedStepKey(guide.key, step)] ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 text-primary" aria-label={t('sectionGuide.setup.reviewed')} /> : <span className="text-xs text-muted-foreground">{t('sectionGuide.setup.to_discover')}</span>}
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onSelect(step)}>{t('sectionGuide.setup.view_step')}<HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" /></Button>
            </CardFooter>
          </Card>)}
          <Card className="gap-4 shadow-none">
            <CardHeader><CardTitle>{t(`access.features.${cloudFeature}`)}</CardTitle><CardDescription>{t(access.error ? 'access.retry_hint' : 'sectionGuide.setup.cloud_description')}</CardDescription></CardHeader>
            <CardFooter className="mt-auto flex-wrap justify-between gap-3">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {access.loading ? <Spinner /> : <HugeiconsIcon icon={cloudAllowed ? CloudIcon : LockIcon} className="size-4" />}
                {t(access.loading ? 'access.checking' : access.error ? 'access.unavailable' : cloudAllowed ? 'sectionGuide.setup.included' : !access.connected ? 'access.account_required' : 'sectionGuide.setup.plan_required')}
              </span>
              <Button variant="ghost" size="sm" disabled={busy || access.loading} onClick={onAccount}>{t('sectionGuide.setup.view_access')}</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('sectionGuide.setup.progress_hint')}</p>
    </div>
  </section>;
}
