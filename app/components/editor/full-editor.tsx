import classes from "@/components/editor/styles/editor.module.css";
import React from "react";
import { TitleEditor } from "@/components/editor/title-editor";
import PageEditor from "@/components/editor/page-editor";
import { Container } from "@mantine/core";

const MemoizedTitleEditor = React.memo(TitleEditor);
const MemoizedPageEditor = React.memo(PageEditor);

export interface FullEditorProps {
  noteId: string;
  title: string;
  content: any;
  editable: boolean;
  onTitleChange?: (title: string) => void;
  onContentChange?: (json: any) => void;
}

export function FullEditor({
  noteId,
  title,
  content,
  editable,
  onTitleChange,
  onContentChange,
}: FullEditorProps) {
  return (
    <Container size={900} className={classes.editor}>
      <div className={classes.titleWrapper}>
        <MemoizedTitleEditor
          noteId={noteId}
          title={title}
          editable={editable}
          onTitleChange={onTitleChange}
        />
      </div>
      <div className={classes.pageWrapper}>
        <MemoizedPageEditor
          noteId={noteId}
          editable={editable}
          content={content}
          onContentChange={onContentChange}
        />
      </div>
    </Container>
  );
}
