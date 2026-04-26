import type { Editor } from '@tiptap/core';
import {
  Bot, BrainCircuit, Image, Link, Minus, Table,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ListButton } from '@/components/tiptap-ui/list-button';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';
import { Button } from '@/components/tiptap-ui-primitive/button';

interface NoteToolbarProps {
  editor: Editor;
  focused?: boolean;
  onAskAI?: () => void;
  onInsertAIBlock?: () => void;
}

export default function NoteToolbar({
  editor,
  focused = false,
  onAskAI,
  onInsertAIBlock,
}: NoteToolbarProps) {
  const { t } = useTranslation();

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const insertImage = () => {
    const url = window.prompt('URL de la imagen');
    if (url) editor.chain().focus().setImage({ src: url }).run();
  };

  return (
    <div className={`note-toolbar${focused ? ' focused' : ''}`}>
      <Toolbar variant={focused ? 'floating' : 'fixed'} aria-label={t('focused_editor.toolbar')}>
        <ToolbarGroup>
          <UndoRedoButton editor={editor} action="undo" hideWhenUnavailable />
          <UndoRedoButton editor={editor} action="redo" hideWhenUnavailable />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <HeadingDropdownMenu editor={editor} levels={[1, 2, 3]} />
          <MarkButton editor={editor} type="bold" />
          <MarkButton editor={editor} type="italic" />
          <MarkButton editor={editor} type="underline" />
          <MarkButton editor={editor} type="strike" />
          <MarkButton editor={editor} type="code" />
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <ListButton editor={editor} type="bulletList" />
          <ListButton editor={editor} type="orderedList" />
          <ListButton editor={editor} type="taskList" />
          <BlockquoteButton editor={editor} />
          <CodeBlockButton editor={editor} />
        </ToolbarGroup>
        {!focused && (
          <>
            <ToolbarSeparator />
            <ToolbarGroup>
              <TextAlignButton editor={editor} align="left" />
              <TextAlignButton editor={editor} align="center" />
              <TextAlignButton editor={editor} align="right" />
            </ToolbarGroup>
          </>
        )}
        <ToolbarSeparator />
        <ToolbarGroup>
          <Button type="button" variant="ghost" tooltip={t('focused_editor.link')} onClick={() => {
            const url = window.prompt(t('focused_editor.link_prompt'));
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}>
            <Link className="tiptap-button-icon" />
          </Button>
          <Button type="button" variant="ghost" tooltip={t('focused_editor.divider')} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="tiptap-button-icon" />
          </Button>
          <Button type="button" variant="ghost" tooltip={t('focused_editor.table')} onClick={insertTable}>
            <Table className="tiptap-button-icon" />
          </Button>
          <Button type="button" variant="ghost" tooltip={t('focused_editor.image')} onClick={insertImage}>
            <Image className="tiptap-button-icon" />
          </Button>
        </ToolbarGroup>
        {focused && (
          <>
            <ToolbarSeparator />
            <ToolbarGroup>
              <Button type="button" variant="ghost" tooltip={t('focused_editor.ask_ai')} onClick={onAskAI}>
                <BrainCircuit className="tiptap-button-icon" />
                <span className="tiptap-button-text">{t('focused_editor.ai_short')}</span>
              </Button>
              <Button type="button" variant="ghost" tooltip={t('focused_editor.ai_block')} onClick={onInsertAIBlock}>
                <Bot className="tiptap-button-icon" />
              </Button>
            </ToolbarGroup>
          </>
        )}
      </Toolbar>
    </div>
  );
}
