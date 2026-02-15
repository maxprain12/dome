import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Typography from '@tiptap/extension-typography';
import Dropcursor from '@tiptap/extension-dropcursor';
import Gapcursor from '@tiptap/extension-gapcursor';
import { createLowlight } from 'lowlight';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/javascript';
import { CalloutExtension } from './extensions/Callout';
import { ToggleExtension } from './extensions/Toggle';
import { DividerExtension } from './extensions/Divider';
import { MermaidExtension } from './extensions/Mermaid';
import { PDFEmbedExtension } from './extensions/PDFEmbed';
import { VideoEmbedExtension } from './extensions/VideoEmbed';
import { AudioEmbedExtension } from './extensions/AudioEmbed';
import { ResourceMentionExtension } from './extensions/ResourceMention';
import { FileBlockExtension } from './extensions/FileBlock';
import { DragHandleExtension } from './extensions/DragHandle';
import { SlashCommandExtension } from './extensions/SlashCommand';
import { AIBubbleMenu } from './AIBubbleMenu';
import { SlashCommandMenu } from './SlashCommand';
import { getSlashCommandItems } from './SlashCommand';
import { useAppStore } from '@/lib/store/useAppStore';

// Configurar lowlight
const lowlight = createLowlight();
lowlight.register({ typescript, javascript, python });

interface NotionEditorProps {
  content?: string;
  contentType?: 'html' | 'json';
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export default function NotionEditor({
  content = '',
  contentType = 'html',
  onChange,
  editable = true,
  placeholder = 'Escribe "/" para comandos...',
}: NotionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        dropcursor: false,
        gapcursor: false,
        codeBlock: false,
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Dropcursor.configure({
        color: 'var(--accent)',
        width: 2,
      }),
      Gapcursor,
      Typography,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow.configure({}),
      TableHeader.configure({}),
      TableCell.configure({}),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary-600 underline hover:text-primary-700',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg',
        },
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Placeholder.configure({
        placeholder,
      }),
      SlashCommandExtension.configure({
        commands: getSlashCommandItems(),
      }),
      CalloutExtension,
      ToggleExtension,
      DividerExtension,
      MermaidExtension,
      PDFEmbedExtension,
      VideoEmbedExtension,
      AudioEmbedExtension,
      ResourceMentionExtension,
      FileBlockExtension,
      DragHandleExtension,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
    editorProps: {
      attributes: {
        class: 'notion-editor prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none max-w-none',
        spellcheck: 'false',
      },
    },
  });

  const handleFileDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files);
    
    if (!files.length || !editor) return;

    for (const file of files) {
      try {
        // Get file path via Electron API
        const filePath = (window.electron as any)?.getPathForFile?.(file);
        if (!filePath) {
          console.error('Could not get file path');
          continue;
        }

        // Determine file type
        const ext = file.name.split('.').pop()?.toLowerCase();
        let type: string = 'document';
        if (ext === 'pdf') type = 'pdf';
        else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) type = 'image';
        else if (['mp4', 'webm', 'mov'].includes(ext || '')) type = 'video';
        else if (['mp3', 'wav', 'ogg'].includes(ext || '')) type = 'audio';

        // Import file via IPC
        const currentProject = useAppStore.getState().currentProject;
        const projectId = currentProject?.id || 'default';
        const result = await (window.electron as any).resource.import(filePath, projectId, type, file.name);

        if (result?.success && result.data) {
          const resource = result.data;
          
          // Insert appropriate block based on type
          if (type === 'image') {
            // Get file data URL for image
            const fileData = await (window.electron as any).resource.readFile(resource.id);
            if (fileData?.success && fileData.data) {
              editor.chain().focus().setImage({ src: fileData.data }).run();
            }
          } else if (type === 'pdf') {
            editor.chain().focus().setPDFEmbed({
              resourceId: resource.id,
              pageStart: 1,
              zoom: 1.0,
            }).run();
          } else {
            // Insert file block
            editor.chain().focus().setFileBlock({
              resourceId: resource.id,
              filename: resource.original_filename || resource.title,
              mimeType: resource.file_mime_type,
              size: resource.file_size,
            }).run();
          }
        }
      } catch (err) {
        console.error('Error handling file drop:', err);
      }
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <>
      {editable && (
        <>
          <SlashCommandMenu editor={editor} />
          <AIBubbleMenu editor={editor} />
        </>
      )}
      <div
        className="notion-editor-wrapper"
        style={{ position: 'relative' }}
        onDrop={handleFileDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <EditorContent editor={editor} className="notion-editor-content" />
      </div>
    </>
  );
}
