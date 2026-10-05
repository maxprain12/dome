import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import type { Grants } from '@/lib/manys/api';
import {
  OUTSIDE_CAPABILITIES, computerEnabled, hasCapability, outsideEnabled, withCapabilities, withComputerOn,
} from './computerPermissions';

const LIBRARY = ['vault.read', 'vault.write'] as const;

interface RowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

/** One line: the name and its switch. The longer explanation is the tooltip, not text on the panel. */
function Row({ id, label, hint, checked, disabled, onChange }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-3" title={hint}>
      <label htmlFor={id} className="min-w-0 grow cursor-pointer truncate">{label}</label>
      <Switch id={id} size="sm" checked={checked} disabled={disabled} aria-describedby={`${id}-hint`} onCheckedChange={(value) => onChange(value === true)} />
      <span id={`${id}-hint`} className="sr-only">{hint}</span>
    </div>
  );
}

interface Props {
  grants: Grants;
  busy: boolean;
  /** Each switch is saved at once; the person never has to find a Save button for it. */
  onChange: (next: Grants) => void;
}

/**
 * What a Many may do, in four switches: your library, the web, its computer, and acting outside Dome.
 * The computer is all or nothing (the whole desktop, with its browser, terminal and files).
 */
export default function ManyPermissions({ grants, busy, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2.5">
      <Row id="perm-library" label={t('manys.perm.library')} hint={t('manys.perm.libraryHint')} checked={hasCapability(grants, 'vault.read')} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, LIBRARY, on))} />
      <Row id="perm-web" label={t('manys.perm.web')} hint={t('manys.perm.webHint')} checked={hasCapability(grants, 'web.read')} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, ['web.read'], on))} />
      <Row id="perm-computer" label={t('manys.perm.computer')} hint={t('manys.perm.computerHint')} checked={computerEnabled(grants)} disabled={busy} onChange={(on) => onChange(withComputerOn(grants, on))} />
      <Row id="perm-outside" label={t('manys.perm.outside')} hint={t('manys.perm.outsideHint')} checked={outsideEnabled(grants)} disabled={busy} onChange={(on) => onChange(withCapabilities(grants, OUTSIDE_CAPABILITIES, on))} />
    </div>
  );
}
