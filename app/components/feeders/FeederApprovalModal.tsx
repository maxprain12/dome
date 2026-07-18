import { HugeiconsIcon } from '@hugeicons/react';
import {
  SecurityCheckIcon,
  Key01Icon,
  CodeIcon,
  Alert02Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { FeederRecord } from '@/lib/feeders/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
type Props = {
  feeder: FeederRecord | null;
  opened: boolean;
  onClose: () => void;
  onApprove: () => void;
  approving?: boolean;
};

export default function FeederApprovalModal({ feeder, opened, onClose, onApprove, approving }: Props) {
  const { t } = useTranslation();
  if (!feeder) return null;

  const secretRefs = (feeder.envSecretRefs ?? []).filter((r) => r?.envName && r?.secretName);

  return (
    <AppModal open={opened} onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppModalContent size="xl">
        <AppModalHeader title={t('feeders.approve_title', { name: feeder.name })} />
        <AppModalBody>
      <div className="flex flex-col gap-4">
        {/* Metadata pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="max-w-full font-semibold text-xs px-2 py-0.5 gap-1 h-auto" style={{ background: 'color-mix(in srgb, var(--primary) 18%, transparent)', color: 'var(--primary)', borderColor: 'transparent' }}><span className="truncate">{feeder.interpreter}</span></Badge>
          <Badge variant="outline" className="max-w-full font-semibold text-xs px-2 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--muted-foreground)', color: 'var(--muted-foreground)', background: 'transparent' }}><span className="truncate">{feeder.updatePolicy}</span></Badge>
          <Badge variant="outline" className="max-w-full font-semibold text-xs px-2 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--muted-foreground)', color: 'var(--muted-foreground)', background: 'transparent' }}><span className="truncate">{feeder.outputMode}</span></Badge>
          <Badge variant="outline" className="max-w-full font-semibold text-xs px-2 py-0.5 gap-1 h-auto" style={{ borderColor: 'var(--muted-foreground)', color: 'var(--muted-foreground)', background: 'transparent' }}><span className="truncate">{`${(feeder.timeoutMs / 1000).toFixed(0)}s timeout`}</span></Badge>
        </div>

        {feeder.description ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {feeder.description}
          </p>
        ) : null}

        {/* Required secrets — critical for diagnosing missing-env errors */}
        {secretRefs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Key01Icon} className="size-3.5 text-primary" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('feeders.required_secrets')}
              </p>
            </div>
            <ul className="flex flex-col gap-1">
              {secretRefs.map((r) => (
                <li
                  key={`${r.envName}-${r.secretName}`}
                  className="flex items-center gap-2 text-xs font-mono rounded-md border border-border bg-background px-2.5 py-1.5"
                >
                  <code className="text-foreground font-semibold">{r.envName}</code>
                  <span className="text-muted-foreground">←</span>
                  <code className="text-primary">{r.secretName}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Alert role="note"><HugeiconsIcon icon={Alert02Icon} aria-hidden /><AlertDescription className="text-xs">
          {t('feeders.approve_hint')}
        </AlertDescription></Alert>

        {/* Script */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <HugeiconsIcon icon={CodeIcon} className="size-3.5 text-muted-foreground" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('feeders.script', { defaultValue: 'Script' })}
            </p>
          </div>
          <pre
            className="rounded-lg border border-border bg-muted p-3 overflow-auto text-[11px] leading-relaxed font-mono text-foreground"
            style={{ maxHeight: 320 }}
          >
            <code>{feeder.script}</code>
          </pre>
        </div>
      </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onApprove} loading={approving}>
            <HugeiconsIcon icon={SecurityCheckIcon} className="size-4" />
            {t('feeders.approve_action')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
