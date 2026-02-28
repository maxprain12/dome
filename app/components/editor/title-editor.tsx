import "@/components/editor/styles/index.css";
import React, { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { Text } from "@tiptap/extension-text";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useAtomValue, useAtom } from "jotai";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/components/editor/atoms/editor-atoms";
import { useDebouncedCallback, getHotkeyHandler } from "@mantine/hooks";
import { History } from "@tiptap/extension-history";
import EmojiCommand from "@/components/editor/extensions/emoji-command";

export interface TitleEditorProps {
  noteId: string;
  title: string;
  editable: boolean;
  onTitleChange?: (title: string) => void;
  onEnterKey?: () => void;
}

export function TitleEditor({
  noteId,
  title,
  editable,
  onTitleChange,
  onEnterKey,
}: TitleEditorProps) {
  const pageEditor = useAtomValue(pageEditorAtom);
  const [, setTitleEditor] = useAtom(titleEditorAtom);
  const [activeNoteId, setActiveNoteId] = useState(noteId);

  const titleEditor = useEditor({
    extensions: [
      Document.extend({
        content: "heading",
      }),
      Heading.configure({
        levels: [1],
      }),
      Text,
      Placeholder.configure({
        placeholder: "Sin título",
        showOnlyWhenEditable: false,
      }),
      History.configure({
        depth: 20,
      }),
      EmojiCommand,
    ],
    onCreate({ editor }) {
      if (editor) {
        // @ts-ignore
        setTitleEditor(editor);
        setActiveNoteId(noteId);
      }
    },
    onUpdate({ editor }) {
      debounceUpdate();
    },
    editable: editable,
    content: title,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      handleDOMEvents: {
        keydown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
            event.preventDefault();
            return true;
          }
        },
        blur: () => {
          debounceUpdate.flush();
        },
      },
    },
  });

  const saveTitle = useCallback(() => {
    if (!titleEditor || activeNoteId !== noteId) return;
    const currentText = titleEditor.getText();
    if (currentText === title || (currentText === "" && title === null)) {
      return;
    }
    onTitleChange?.(currentText);
  }, [noteId, title, titleEditor, onTitleChange, activeNoteId]);

  const debounceUpdate = useDebouncedCallback(saveTitle, 500);

  // Sync title when noteId changes
  useEffect(() => {
    if (titleEditor && title !== titleEditor.getText()) {
      titleEditor.commands.setContent(title);
    }
    setActiveNoteId(noteId);
  }, [noteId, title, titleEditor]);

  useEffect(() => {
    setTimeout(() => {
      if (!titleEditor?.isInitialized) return;
      titleEditor?.commands?.focus("end");
    }, 300);
  }, [titleEditor]);

  useEffect(() => {
    return () => {
      saveTitle();
    };
  }, [noteId]);

  useEffect(() => {
    if (titleEditor) {
      titleEditor.setEditable(editable);
    }
  }, [editable, titleEditor]);

  const openSearchDialog = () => {
    const event = new CustomEvent("openFindDialogFromEditor", {});
    document.dispatchEvent(event);
  };

  function handleTitleKeyDown(event: any) {
    if (!titleEditor || !pageEditor || event.shiftKey) return;

    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
      return;

    const { key } = event;
    const { $head } = titleEditor.state.selection;

    if (key === "Enter") {
      event.preventDefault();

      if (onEnterKey) {
        onEnterKey();
        return;
      }

      const { $from } = titleEditor.state.selection;
      const titleText = titleEditor.getText();
      const textOffset = $from.parentOffset;
      const textAfterCursor = titleText.slice(textOffset);
      const endPos = titleEditor.state.doc.content.size;

      if (textAfterCursor) {
        titleEditor.commands.deleteRange({ from: $from.pos, to: endPos });
      }

      // @ts-ignore
      pageEditor
        .chain()
        .command(({ tr }) => {
          tr.setMeta("addToHistory", false);
          return true;
        })
        .insertContentAt(0, {
          type: "paragraph",
          content: textAfterCursor
            ? [{ type: "text", text: textAfterCursor }]
            : undefined,
        })
        .focus("start")
        .run();
      return;
    }

    const shouldFocusEditor =
      key === "ArrowDown" || (key === "ArrowRight" && !$head.nodeAfter);

    if (shouldFocusEditor) {
      // @ts-ignore
      pageEditor.commands.focus("start");
    }
  }

  return (
    <EditorContent
      editor={titleEditor}
      onKeyDown={(event) => {
        getHotkeyHandler([["mod+F", openSearchDialog]])(event);
        handleTitleKeyDown(event);
      }}
    />
  );
}
