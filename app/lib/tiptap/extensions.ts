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
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
import UniqueID from '@tiptap/extension-unique-id';
import Youtube from '@tiptap/extension-youtube';
import { createLowlight, common } from 'lowlight';

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

const lowlight = createLowlight(common);

/** Core note blocks (TipTap). Slash + Mention are composed in NoteEditor. */
export function buildCoreNoteExtensions(placeholder = 'Escribe algo...') {
  return [
    NoteEditorBridge,
    StarterKit.configure({
      codeBlock: false,
    }),
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
    CodeBlockLowlight.configure({ lowlight }),
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
        'twoColumnLayout',
        'threeColumnLayout',
        'column',
        'youtube',
      ],
    }),
  ];
}

/** @deprecated Use buildCoreNoteExtensions — alias for compatibility */
export function buildNoteExtensions(placeholder = 'Escribe algo...') {
  return buildCoreNoteExtensions(placeholder);
}
