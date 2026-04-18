'use client';

import { useState } from 'react';
import { Modal, Stack, TextInput, Button, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Editor } from '@tiptap/core';
import type { NoteEmbedKind } from '@/lib/tiptap/extensions/note-editor-bridge';

export interface EmbedModalProps {
  opened: boolean;
  onClose: () => void;
  editor: Editor | null;
  kind: NoteEmbedKind | null;
}

export default function EmbedModal({ opened, onClose, editor, kind }: EmbedModalProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    const trimmed = url.trim();
    if (!trimmed || !editor || !kind) {
      setErr(t('editor.embed_modal_invalid_url'));
      return;
    }
    if (kind === 'youtube') {
      const ok = editor.chain().focus().setYoutubeVideo({ src: trimmed }).run();
      if (!ok) {
        setErr(t('editor.embed_modal_invalid_youtube'));
        return;
      }
    } else if (kind === 'iframe') {
      editor.chain().focus().insertIframeEmbed({ src: trimmed }).run();
    }
    setUrl('');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        setUrl('');
        setErr(null);
        onClose();
      }}
      title={kind === 'youtube' ? t('editor.embed_modal_title_youtube') : t('editor.embed_modal_title_iframe')}
      size="md"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {kind === 'youtube' ? t('editor.embed_modal_url_help_youtube') : t('editor.embed_modal_url_help_iframe')}
        </Text>
        <TextInput
          label={t('editor.embed_modal_url_label')}
          placeholder={t('editor.embed_modal_url_placeholder')}
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        {err && (
          <Text size="sm" c="red">
            {err}
          </Text>
        )}
        <Button onClick={submit}>{t('editor.embed_modal_submit')}</Button>
      </Stack>
    </Modal>
  );
}
