import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon, PlusSignIcon } from '@hugeicons/core-free-icons';

interface ProfileFieldRow {
  /** Stable local key for React — independent from the (editable) field name. */
  rowId: string;
  key: string;
  value: string;
}

let rowIdCounter = 0;
function nextRowId(): string {
  rowIdCounter += 1;
  return `field-${rowIdCounter}`;
}

function profileToRows(profile: Record<string, unknown> | undefined): ProfileFieldRow[] {
  if (!profile) return [];
  return Object.entries(profile).map(([key, value]) => ({
    rowId: nextRowId(),
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }));
}

function rowsToProfile(rows: ProfileFieldRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) continue;
    out[key] = row.value;
  }
  return out;
}

interface PersonProfileEditorProps {
  profile: Record<string, unknown> | undefined;
  onChange: (profile: Record<string, unknown>) => void;
}

/** Simple key/value editor for the person's freeform `profile` JSON blob. */
export default function PersonProfileEditor({ profile, onChange }: PersonProfileEditorProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProfileFieldRow[]>(() => profileToRows(profile));

  // Re-sync when a different person is loaded (identity change, not every keystroke).
  useEffect(() => {
    setRows(profileToRows(profile));
  }, [profile]);

  const commit = (next: ProfileFieldRow[]) => {
    setRows(next);
    onChange(rowsToProfile(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('people.custom_fields_empty')}</p>
      ) : (
        rows.map((row) => (
          <div key={row.rowId} className="flex items-center gap-1.5">
            <Input
              value={row.key}
              onChange={(e) => commit(rows.map((r) => (r.rowId === row.rowId ? { ...r, key: e.target.value } : r)))}
              placeholder={t('people.field_key_placeholder')}
              aria-label={t('people.field_key_placeholder')}
              className="w-1/3"
            />
            <Input
              value={row.value}
              onChange={(e) => commit(rows.map((r) => (r.rowId === row.rowId ? { ...r, value: e.target.value } : r)))}
              placeholder={t('people.field_value_placeholder')}
              aria-label={t('people.field_value_placeholder')}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('people.remove_field')}
              onClick={() => commit(rows.filter((r) => r.rowId !== row.rowId))}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </Button>
          </div>
        ))
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => commit([...rows, { rowId: nextRowId(), key: '', value: '' }])}
      >
        <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
        {t('people.add_field')}
      </Button>
    </div>
  );
}
