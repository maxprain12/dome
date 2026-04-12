'use client';

import { useState } from 'react';
import { Modal, Stack, TextInput, Button, Text } from '@mantine/core';
import type { Editor } from '@tiptap/core';
import type { NoteEmbedKind } from '@/lib/tiptap/extensions/note-editor-bridge';

export interface EmbedModalProps {
  opened: boolean;
  onClose: () => void;
  editor: Editor | null;
  kind: NoteEmbedKind | null;
}

export default function EmbedModal({ opened, onClose, editor, kind }: EmbedModalProps) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    const trimmed = url.trim();
    if (!trimmed || !editor || !kind) {
      setErr('Introduce una URL válida');
      return;
    }
    if (kind === 'youtube') {
      const ok = editor.chain().focus().setYoutubeVideo({ src: trimmed }).run();
      if (!ok) {
        setErr('URL de YouTube no reconocida');
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
      title={kind === 'youtube' ? 'Insertar YouTube' : 'Insertar iframe'}
      size="md"
      centered
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {kind === 'youtube'
            ? 'Pega el enlace del vídeo (youtube.com o youtu.be)'
            : 'URL de la página a incrustar (usa solo fuentes de confianza)'}
        </Text>
        <TextInput
          label="URL"
          placeholder="https://…"
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
        <Button onClick={submit}>Insertar</Button>
      </Stack>
    </Modal>
  );
}
