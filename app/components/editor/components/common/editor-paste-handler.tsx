import { uploadImageAction } from "@/components/editor/components/image/upload-image-action";
import { uploadVideoAction } from "@/components/editor/components/video/upload-video-action";
import { uploadAttachmentAction } from "@/components/editor/components/attachment/upload-attachment-action";
import { Editor } from "@tiptap/core";

export const handlePaste = (
  editor: Editor,
  event: ClipboardEvent,
  noteId: string,
) => {
  if (event.clipboardData?.files.length) {
    event.preventDefault();
    for (const file of event.clipboardData.files) {
      const pos = editor.state.selection.from;
      uploadImageAction(file, editor, pos, noteId);
      uploadVideoAction(file, editor, pos, noteId);
      uploadAttachmentAction(file, editor, pos, noteId);
    }
    return true;
  }
  return false;
};

export const handleFileDrop = (
  editor: Editor,
  event: DragEvent,
  moved: boolean,
  noteId: string,
) => {
  if (!moved && event.dataTransfer?.files.length) {
    event.preventDefault();

    for (const file of event.dataTransfer.files) {
      const coordinates = editor.view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      const pos = coordinates?.pos ?? 0;
      uploadImageAction(file, editor, pos, noteId);
      uploadVideoAction(file, editor, pos, noteId);
      uploadAttachmentAction(file, editor, pos, noteId);
    }
    return true;
  }
  return false;
};
