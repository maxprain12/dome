import { hubFieldLabelClass } from '@/components/shared/hubChrome';

export function ReadField({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className={hubFieldLabelClass}>{label}</span>
      <span className="truncate text-xs font-medium">{text || '—'}</span>
    </div>
  );
}
