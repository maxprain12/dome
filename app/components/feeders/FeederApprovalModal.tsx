import { useTranslation } from 'react-i18next';
import { ShieldCheck, KeyRound, Code2, AlertTriangle } from 'lucide-react';
import type { FeederRecord } from '@/lib/feeders/api';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import DomeBadge from '@/components/ui/DomeBadge';
import DomeCallout from '@/components/ui/DomeCallout';

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
    <DomeModal
      open={opened}
      onClose={onClose}
      title={t('feeders.approve_title', { name: feeder.name })}
      size="lg"
      footer={
        <>
          <DomeButton variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton
            variant="primary"
            onClick={onApprove}
            loading={approving}
            leftIcon={<ShieldCheck className="size-4" />}
          >
            {t('feeders.approve_action')}
          </DomeButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Metadata pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <DomeBadge label={feeder.interpreter} variant="soft" size="sm" />
          <DomeBadge
            label={feeder.updatePolicy}
            variant="outline"
            size="sm"
            color="var(--secondary-text)"
          />
          <DomeBadge
            label={feeder.outputMode}
            variant="outline"
            size="sm"
            color="var(--secondary-text)"
          />
          <DomeBadge
            label={`${(feeder.timeoutMs / 1000).toFixed(0)}s timeout`}
            variant="outline"
            size="sm"
            color="var(--secondary-text)"
          />
        </div>

        {feeder.description ? (
          <p className="text-xs text-[var(--secondary-text)] leading-relaxed">
            {feeder.description}
          </p>
        ) : null}

        {/* Required secrets — critical for diagnosing missing-env errors */}
        {secretRefs.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-[var(--accent)]" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--secondary-text)]">
                {t('feeders.required_secrets')}
              </p>
            </div>
            <ul className="flex flex-col gap-1">
              {secretRefs.map((r) => (
                <li
                  key={`${r.envName}-${r.secretName}`}
                  className="flex items-center gap-2 text-xs font-mono rounded-md border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5"
                >
                  <code className="text-[var(--primary-text)] font-semibold">{r.envName}</code>
                  <span className="text-[var(--secondary-text)]">←</span>
                  <code className="text-[var(--accent)]">{r.secretName}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DomeCallout tone="warning" icon={AlertTriangle}>
          {t('feeders.approve_hint')}
        </DomeCallout>

        {/* Script */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Code2 className="size-3.5 text-[var(--secondary-text)]" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--secondary-text)]">
              {t('feeders.script', { defaultValue: 'Script' })}
            </p>
          </div>
          <pre
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 overflow-auto text-[11px] leading-relaxed font-mono text-[var(--primary-text)]"
            style={{ maxHeight: 320 }}
          >
            <code>{feeder.script}</code>
          </pre>
        </div>
      </div>
    </DomeModal>
  );
}
