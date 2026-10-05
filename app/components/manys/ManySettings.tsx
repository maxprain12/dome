import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CloudMany } from '@/lib/manys/api';

const labelClass = 'mb-1.5 block text-xs leading-[1.3] font-semibold';

/** The Many's name and what it is for. */
export default function ManySettings({ many, onSave }: { many: CloudMany; onSave: (value: Record<string, unknown>) => Promise<void> }) {
  const { t } = useTranslation();
  const [name, setName] = useState(many.name);
  const [instructions, setInstructions] = useState(many.instructions);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        void onSave({ name, instructions, grants: many.grants }).finally(() => setSaving(false));
      }}
    >
      <div>
        <label htmlFor="many-settings-name" className={labelClass}>{t('manys.name')}</label>
        <Input id="many-settings-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="many-instructions" className={labelClass}>{t('manys.instructions')}</label>
        <Textarea id="many-instructions" rows={4} value={instructions} maxLength={20000} onChange={(e) => setInstructions(e.target.value)} />
      </div>
      <Button type="submit" disabled={saving || !name.trim()} className="self-start">{t('manys.saveChanges')}</Button>
    </form>
  );
}
