import i18n from '@/lib/i18n';

/** Etiqueta traducida para el estado de una ejecución (runs / automatizaciones). */
export function statusLabel(status: string): string {
  const key = `runLog.status.${status}`;
  const translated = i18n.t(key);
  return translated !== key ? translated : status;
}

/** Color de acento para badges / chips de estado de ejecución. */
export function statusColor(status: string): string {
  if (status === 'completed') return 'var(--success)';
  if (status === 'failed') return 'var(--error)';
  if (status === 'running') return 'var(--accent)';
  if (status === 'queued' || status === 'waiting_approval') return 'var(--warning)';
  if (status === 'cancelled') return 'var(--tertiary-text)';
  return 'var(--secondary-text)';
}
