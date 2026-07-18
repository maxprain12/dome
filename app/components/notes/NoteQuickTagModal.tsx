import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';

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
    <AppModal
      open={opened}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="sm">
        <AppModalHeader title={t('notes.quick_tag_title')} />
        <AppModalBody>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="note-quick-tag" className="text-xs">
              {t('notes.quick_tag_label')}
            </FieldLabel>
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
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy} size="sm">
            {t('common.cancel')}
          </Button>
          <Button type="button" loading={busy} onClick={() => void submit()} size="sm">
            {t('notes.quick_tag_save')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}
