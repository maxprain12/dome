import "@/components/editor/styles/index.css";
import React, {
  useCallback,
  useEffect,
  useRef,
  memo,
} from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import { mainExtensions } from "@/components/editor/extensions/extensions";
import { useAtom } from "jotai";
import {
  pageEditorAtom,
} from "@/components/editor/atoms/editor-atoms";
import { EditorBubbleMenu } from "@/components/editor/components/bubble-menu/bubble-menu";
import TableCellMenu from "@/components/editor/components/table/table-cell-menu";
import TableMenu from "@/components/editor/components/table/table-menu";
import ImageMenu from "@/components/editor/components/image/image-menu";
import CalloutMenu from "@/components/editor/components/callout/callout-menu";
import VideoMenu from "@/components/editor/components/video/video-menu";
import {
  handleFileDrop,
  handlePaste,
} from "@/components/editor/components/common/editor-paste-handler";
import LinkMenu from "@/components/editor/components/link/link-menu";
import SearchAndReplaceDialog from "@/components/editor/components/search-and-replace/search-and-replace-dialog";
import ColumnsMenu from "@/components/editor/components/columns/columns-menu";
import { useEditorScroll } from "@/components/editor/hooks/use-editor-scroll";
import { stringToEditorHtml } from "@/lib/utils/markdown";

interface PageEditorProps {
  noteId: string;
  editable: boolean;
  content: any;
  onContentChange?: (json: any) => void;
}

function PageEditor({
  noteId,
  editable,
  content,
  onContentChange,
}: PageEditorProps) {
  const isComponentMounted = useRef(false);
  const editorRef = useRef(null);
  const menuContainerRef = useRef(null);
  const [, setEditor] = useAtom(pageEditorAtom);
  // Keep onContentChange ref always up-to-date without triggering editor recreation
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;

  useEffect(() => {
    isComponentMounted.current = true;
  }, []);

  const canScroll = useCallback(
    () => Boolean(isComponentMounted.current && editorRef.current),
    [isComponentMounted],
  );
  const { handleScrollTo } = useEditorScroll({ canScroll });

  const editor = useEditor(
    {
      extensions: mainExtensions,
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        scrollThreshold: 80,
        scrollMargin: 80,
        handleDOMEvents: {
          keydown: (_view, event) => {
            if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
              event.preventDefault();
              return true;
            }
            if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
              const slashCommand = document.querySelector("#slash-command");
              if (slashCommand) {
                return true;
              }
            }
            if (
              [
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Enter",
              ].includes(event.key)
            ) {
              const emojiCommand = document.querySelector("#emoji-command");
              if (emojiCommand) {
                return true;
              }
            }
          },
        },
        handlePaste: (_view, event) => {
          if (!editorRef.current) return false;
          return handlePaste(editorRef.current, event, noteId);
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (!editorRef.current) return false;
          return handleFileDrop(editorRef.current, event, moved, noteId);
        },
      },
      onCreate({ editor }) {
        if (editor) {
          // @ts-ignore
          if (!editor.storage.__debugEditorId) {
            // @ts-ignore
            editor.storage.__debugEditorId = `${noteId}-${Date.now()}`;
          }
          // @ts-ignore
          setEditor(editor);
          // @ts-ignore
          editor.storage.pageId = noteId;
          handleScrollTo(editor);
          // @ts-ignore
          editorRef.current = editor;
        }
      },
      onUpdate({ editor }) {
        if (editor.isEmpty) return;
        const editorJson = editor.getJSON();
        onContentChangeRef.current?.(editorJson);
      },
    },
    [noteId, editable],
  );

  // Sync content when noteId changes (opening a different note)
  useEffect(() => {
    if (editor && editor.isInitialized) {
      // @ts-ignore
      editor.storage.pageId = noteId;
      if (content) {
        let parsedContent: unknown;
        if (typeof content === 'string') {
          try {
            parsedContent = JSON.parse(content);
            if (parsedContent && typeof parsedContent === 'object' && (parsedContent as { type?: string }).type === 'doc') {
              // Valid Tiptap JSON
            } else {
              parsedContent = stringToEditorHtml(content);
            }
          } catch {
            parsedContent = stringToEditorHtml(content);
          }
        } else {
          parsedContent = content;
        }
        editor.commands.setContent(parsedContent as any, false as any);
      } else {
        editor.commands.setContent('', false as any);
      }
    }
  }, [noteId]);

  const editorIsEditable = useEditorState({
    editor,
    selector: (ctx) => {
      return ctx.editor?.isEditable ?? false;
    },
  });
  const editorIsReady = Boolean(editor && editor.isInitialized);



  return (
    <div className="editor-container" style={{ position: "relative" }}>
      <div ref={menuContainerRef} style={{ position: "relative" }}>
        <EditorContent editor={editor} />

        {editor && (
          <SearchAndReplaceDialog editor={editor} editable={editable} />
        )}

        {editor && editorIsEditable && editorIsReady && (
          <div>
            <EditorBubbleMenu editor={editor} />
            <TableMenu editor={editor} />
            <TableCellMenu
              editor={editor}
              appendTo={menuContainerRef}
            />
            <ImageMenu editor={editor} />
            <VideoMenu editor={editor} />
            <CalloutMenu editor={editor} />
            <ColumnsMenu editor={editor} />
            <LinkMenu editor={editor} appendTo={menuContainerRef} />
          </div>
        )}
      </div>
      <div
        onClick={() => editor?.commands.focus("end")}
        style={{ paddingBottom: "20vh" }}
      ></div>
    </div>
  );
}

// Only re-render when noteId or editable change.
// content prop is only used for initial load (useEffect dep = [noteId]),
// and onContentChange is handled via ref, so both are safe to ignore here.
export default memo(PageEditor, (prev, next) =>
  prev.noteId === next.noteId && prev.editable === next.editable
);
