import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import type { Grants } from '@/lib/manys/api';
import { cn } from '@/lib/utils';
import {
  COMPUTER_KINDS, OUTSIDE_CAPABILITIES, computerAllows, computerEnabled, hasCapability, outsideEnabled,
  withCapabilities, withComputerEnabled, withComputerKind,
} from './computerPermissions';

interface RowProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled: boolean;
  nested?: boolean;
  onChange: (checked: boolean) => void;
}

function Row({ id, label, hint, checked, disabled, nested = false, onChange }: RowProps) {
  return (
    <div className={cn('flex items-start gap-3', nested && 'ml-6')}>
      <Switch id={id} size="sm" checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5" />
      <label htmlFor={id} className="min-w-0 grow cursor-pointer">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </label>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={title}>
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

interface Props {
  grants: Grants;
  busy: boolean;
  /** Each switch is saved at once; the person never has to find a Save button for it. */
  onChange: (next: Grants) => void;
}

/**
 * What a Many may do, in the words of what it does: its library, the web, its computer, and acting
 * outside Dome. Sending, publishing, buying and deleting are one switch because every one of them
 * waits for the person's approval anyway.
 */
export default function ManyPermissions({ grants, busy, onChange }: Props) {
  const { t } = useTranslation();
  const computer = computerEnabled(grants);
  return (
    <div className="flex flex-col gap-5">
      <Group title={t('manys.perm.libraryTitle')}>
        <Row id="perm-vault-read" label={t('manys.perm.read')} hint={t('manys.perm.readHint')} checked={hasCapability(grants, 'vault.read')} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, ['vault.read'], on))} />
        <Row id="perm-vault-write" label={t('manys.perm.write')} hint={t('manys.perm.writeHint')} checked={hasCapability(grants, 'vault.write')} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, ['vault.write'], on))} />
      </Group>
      <Group title={t('manys.perm.webTitle')}>
        <Row id="perm-web" label={t('manys.perm.web')} hint={t('manys.perm.webHint')} checked={hasCapability(grants, 'web.read')} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, ['web.read'], on))} />
      </Group>
      <Group title={t('manys.perm.computerTitle')}>
        <Row id="perm-computer" label={t('manys.perm.computer')} hint={t('manys.perm.computerHint')} checked={computer} disabled={busy} onChange={(on) => onChange(withComputerEnabled(grants, on))} />
        {COMPUTER_KINDS.map((kind) => (
          <Row key={kind} id={`perm-computer-${kind}`} nested label={t(`manys.computer.permissions.${kind}`)} checked={computerAllows(grants, kind)} disabled={busy || !computer} onChange={(on) => onChange(withComputerKind(grants, kind, on))} />
        ))}
      </Group>
      <Group title={t('manys.perm.outsideTitle')}>
        <Row id="perm-outside" label={t('manys.perm.outside')} hint={t('manys.perm.outsideHint')} checked={outsideEnabled(grants)} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, OUTSIDE_CAPABILITIES, on))} />
      </Group>
      <p className="text-xs text-muted-foreground">{t('manys.perm.applies')}</p>
    </div>
  );
}
