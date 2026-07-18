import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
interface NoteQuickTagModalProps {
  opened: boolean;
  onClose: () => void;
  resourceId: string;
  onTagsChanged: () => void;
}

export default function NoteQuickTagModal({
  opened,
  onClose,
  resourceId,
  onTagsChanged,
}: NoteQuickTagModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const raw = name.trim();
    if (!raw || !window.electron?.db?.tags) return;
    setBusy(true);
    try {
      const created = await window.electron.db.tags.create({ name: raw });
      const tagId = created.success && created.data?.id ? created.data.id : null;
      if (!created.success || !tagId) {
        return;
      }
      const attach = await window.electron.db.tags.addToResource(resourceId, tagId);
      if (attach.success) {
        setName('');
        onTagsChanged();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{t('notes.quick_tag_title')}</DialogTitle></div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="note-quick-tag" className="text-xs">{t('notes.quick_tag_label')}</FieldLabel>
        <Input
          id="note-quick-tag"
          placeholder={t('notes.quick_tag_placeholder')}
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          // Focus the single input of a just-opened quick modal (expected UX).
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      </Field>
    </div><DialogFooter className="border-t px-4 py-3">{<>
          <Button type="button"
  variant="ghost"
  onClick={onClose}
  disabled={busy}
  size="sm">
            {t('common.cancel')}
          </Button>
          <Button type="button"
  loading={busy}
  onClick={() => void submit()}
  size="sm">
            {t('notes.quick_tag_save')}
          </Button>
        </>}</DialogFooter></DialogContent></Dialog>
  );
}
