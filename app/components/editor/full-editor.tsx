import classes from "@/components/editor/styles/editor.module.css";
import React from "react";
import { TitleEditor } from "@/components/editor/title-editor";
import PageEditor from "@/components/editor/page-editor";
import { Container } from "@mantine/core";

const MemoizedTitleEditor = React.memo(TitleEditor);

export interface FullEditorProps {
  noteId: string;
  title: string;
  content: unknown;
  /** Bumps when parent replaces body from outside the editor (IPC, restore). */
  contentRevision?: number;
  /** When false, title is expected in the workspace chrome (e.g. WorkspaceHeader). */
  showTitleEditor?: boolean;
  editable: boolean;
  onTitleChange?: (title: string) => void;
  onContentChange?: (json: unknown) => void;
}

export function FullEditor({
  noteId,
  title,
  content,
  contentRevision = 0,
  showTitleEditor = true,
  editable,
  onTitleChange,
  onContentChange,
}: FullEditorProps) {
  return (
    <Container size={900} className={classes.editor}>
      {showTitleEditor ? (
        <div className={classes.titleWrapper}>
          <MemoizedTitleEditor
            noteId={noteId}
            title={title}
            editable={editable}
            onTitleChange={onTitleChange}
          />
        </div>
      ) : null}
      <div className={classes.pageWrapper}>
        <PageEditor
          noteId={noteId}
          editable={editable}
          content={content}
          contentRevision={contentRevision}
          onContentChange={onContentChange}
        />
      </div>
    </Container>
  );
}
