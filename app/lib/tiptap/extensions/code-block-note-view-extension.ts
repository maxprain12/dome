import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { CodeBlockNoteView } from '@/components/editor/CodeBlockNoteView';

export const DomeCodeBlockLowlight = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNoteView);
  },
});
