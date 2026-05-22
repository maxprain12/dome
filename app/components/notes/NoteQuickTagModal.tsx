import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeInput } from '@/components/ui/DomeInput';

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
    <DomeModal
      open={opened}
      onClose={onClose}
      title={t('notes.quick_tag_title')}
      size="sm"
      footer={
        <>
          <DomeButton type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton type="button" variant="primary" size="sm" loading={busy} onClick={() => void submit()}>
            {t('notes.quick_tag_save')}
          </DomeButton>
        </>
      }
    >
      <DomeInput
        label={t('notes.quick_tag_label')}
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
        autoFocus
      />
    </DomeModal>
  );
}
