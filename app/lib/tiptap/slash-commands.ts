import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';

export interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  group: string;
  command: (editor: Editor) => void;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Text
  {
    title: 'Texto',
    description: 'Párrafo normal',
    icon: 'T',
    group: 'Básico',
    command: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: 'Título 1',
    description: 'Sección grande',
    icon: 'H1',
    group: 'Básico',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Título 2',
    description: 'Sección mediana',
    icon: 'H2',
    group: 'Básico',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Título 3',
    description: 'Sección pequeña',
    icon: 'H3',
    group: 'Básico',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  // Lists
  {
    title: 'Lista',
    description: 'Lista con viñetas',
    icon: '•',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Lista numerada',
    description: 'Lista ordenada',
    icon: '1.',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Lista de tareas',
    description: 'Con checkboxes',
    icon: '☐',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  // Blocks
  {
    title: 'Cita',
    description: 'Bloque de cita',
    icon: '"',
    group: 'Bloques',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Código',
    description: 'Bloque de código',
    icon: '</>',
    group: 'Bloques',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Separador',
    description: 'Línea horizontal',
    icon: '—',
    group: 'Bloques',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Tabla',
    description: 'Tabla 3×3',
    icon: '⊞',
    group: 'Insertar',
    command: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

export type SlashCommandSuggestionOptions = Omit<SuggestionOptions<SlashCommand>, 'editor'>;

export const SlashCommandExtension = Extension.create<{ suggestion: Partial<SlashCommandSuggestionOptions> }>({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          if (!q) return SLASH_COMMANDS;
          return SLASH_COMMANDS.filter(
            (cmd) =>
              cmd.title.toLowerCase().includes(q) ||
              cmd.description.toLowerCase().includes(q) ||
              cmd.group.toLowerCase().includes(q),
          );
        },
        command: ({ editor, range, props }: { editor: Editor; range: any; props: SlashCommand }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...(this.options.suggestion as SuggestionOptions<SlashCommand>),
      }),
    ];
  },
});
