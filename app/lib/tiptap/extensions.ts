import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import UniqueID from '@tiptap/extension-unique-id';
import Youtube from '@tiptap/extension-youtube';
import { Collaboration } from '@tiptap/extension-collaboration';
import { NodeRange } from '@tiptap/extension-node-range';
import { createLowlight, common } from 'lowlight';
import type { Doc } from 'yjs';

import { NoteEditorBridge } from '@/lib/tiptap/extensions/note-editor-bridge';
import { Callout } from '@/lib/tiptap/extensions/callout';
import { ToggleBlock, ToggleSummary, ToggleBody } from '@/lib/tiptap/extensions/toggle-block';
import { StyledDivider } from '@/lib/tiptap/extensions/styled-divider';
import {
  Column,
  TwoColumnLayout,
  ThreeColumnLayout,
  ColumnLayoutCommands,
} from '@/lib/tiptap/extensions/column-layout';
import { ResourceLink } from '@/lib/tiptap/extensions/resource-link';
import { IframeEmbed } from '@/lib/tiptap/extensions/iframe-embed';
import { AIBlock } from '@/lib/tiptap/extensions/ai-block';
import {
  DomeCodeBlockLowlight,
} from '@/lib/tiptap/extensions/code-block-note-view-extension';

const lowlight = createLowlight(common);

export interface BuildCoreNoteExtensionsOptions {
  placeholder?: string;
  /** Yjs document backing the fragment — required so `@tiptap/extension-drag-handle` can sync with collaboration. */
  collaborationDocument: Doc;
  /**
   * Fired once when Collaboration has applied the Y.Xml fragment to the editor.
   * Use this with a standalone `Y.Doc` (no provider) to seed content from persisted storage.
   */
  collaborationOnFirstRender?: () => void;
}

/** Core note blocks (TipTap). Slash + Mention are composed in NoteEditor. */
export function buildCoreNoteExtensions(options: BuildCoreNoteExtensionsOptions) {
  const placeholder = options.placeholder ?? 'Escribe algo...';

  const starterConfigure = {
    codeBlock: false as const,
    undoRedo: false as const,
  };

  return [
    NoteEditorBridge,
    Collaboration.configure({
      document: options.collaborationDocument,
      onFirstRender: options.collaborationOnFirstRender,
    }),
    NodeRange,
    StarterKit.configure(starterConfigure),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Typography,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    DomeCodeBlockLowlight.configure({ lowlight }),
    Placeholder.configure({ placeholder }),
    Youtube.configure({
      width: 640,
      height: 360,
      nocookie: true,
    }),
    Callout,
    ToggleSummary,
    ToggleBody,
    ToggleBlock,
    StyledDivider,
    Column,
    TwoColumnLayout,
    ThreeColumnLayout,
    ColumnLayoutCommands,
    ResourceLink,
    IframeEmbed,
    AIBlock,
    UniqueID.configure({
      types: [
        'paragraph',
        'heading',
        'blockquote',
        'listItem',
        'taskItem',
        'tableRow',
        'codeBlock',
        'callout',
        'toggleBlock',
        'toggleSummary',
        'toggleBody',
        'styledDivider',
        'iframeEmbed',
        'aiBlock',
        'twoColumnLayout',
        'threeColumnLayout',
        'column',
        'youtube',
      ],
    }),
  ];
}
