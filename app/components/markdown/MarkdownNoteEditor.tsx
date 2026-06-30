'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { replaceAll } from '@milkdown/utils';
import { EditorStatus } from '@milkdown/kit/core';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import './markdown-note-editor.css';

export interface MarkdownNoteEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
}

interface InnerProps {
  initialMarkdown: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: () => void;
  onReady?: () => void;
  handleRef: Ref<MarkdownNoteEditorHandle>;
}

function CrepeEditorInner({
  initialMarkdown,
  readOnly,
  placeholder,
  onChange,
  onReady,
  handleRef,
}: InnerProps) {
  const { t } = useTranslation();
  const crepeRef = useRef<Crepe | null>(null);
  const initialRef = useRef(initialMarkdown);
  const readyRef = useRef(false);

  const { get, loading } = useEditor(
    (root) => {
      const featureConfigs = {
        [CrepeFeature.BlockEdit]: {
          textGroup: {
            label: t('notes.slash_group_text'),
            text: { label: t('notes.slash_item_text') },
            h1: { label: t('notes.slash_item_h1') },
            h2: { label: t('notes.slash_item_h2') },
            h3: { label: t('notes.slash_item_h3') },
            h4: { label: t('notes.slash_item_h4') },
            h5: { label: t('notes.slash_item_h5') },
            h6: { label: t('notes.slash_item_h6') },
            quote: { label: t('notes.slash_item_quote') },
            divider: { label: t('notes.slash_item_divider') },
          },
          listGroup: {
            label: t('notes.slash_group_list'),
            bulletList: { label: t('notes.slash_item_bullet') },
            orderedList: { label: t('notes.slash_item_ordered') },
            taskList: { label: t('notes.slash_item_task') },
          },
          advancedGroup: {
            label: t('notes.slash_group_advanced'),
            image: { label: t('notes.slash_item_image') },
            codeBlock: { label: t('notes.slash_item_code') },
            table: { label: t('notes.slash_item_table') },
            math: { label: t('notes.slash_item_math') },
          },
        },
        ...(placeholder
          ? {
              [CrepeFeature.Placeholder]: {
                text: placeholder,
                mode: 'doc' as const,
              },
            }
          : {}),
      };

      const crepe = new Crepe({
        root,
        defaultValue: initialRef.current,
        features: {
          [CrepeFeature.AI]: false,
        },
        featureConfigs,
      });
      crepe.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) onChange?.();
        });
      });
      crepeRef.current = crepe;
      return crepe;
    },
    [],
  );

  useEffect(() => {
    crepeRef.current?.setReadonly(!!readOnly);
  }, [readOnly, loading]);

  useEffect(() => {
    if (loading || readyRef.current) return;
    readyRef.current = true;
    onReady?.();
  }, [loading, onReady]);

  useImperativeHandle(handleRef, () => ({
    getMarkdown: () => crepeRef.current?.getMarkdown() ?? '',
    setMarkdown: (markdown: string) => {
      const editor = get();
      if (editor?.status === EditorStatus.Created) {
        editor.action(replaceAll(markdown));
      } else {
        initialRef.current = markdown;
      }
    },
  }));

  return (
    <div className="markdown-note-editor-host">
      <Milkdown />
    </div>
  );
}

interface MarkdownNoteEditorProps {
  initialMarkdown: string;
  readOnly?: boolean;
  placeholder?: string;
  onChange?: () => void;
  onReady?: () => void;
}

const MarkdownNoteEditor = forwardRef<MarkdownNoteEditorHandle, MarkdownNoteEditorProps>(
  function MarkdownNoteEditor(props, ref) {
    return (
      <MilkdownProvider>
        <CrepeEditorInner {...props} handleRef={ref} />
      </MilkdownProvider>
    );
  },
);

export default MarkdownNoteEditor;
