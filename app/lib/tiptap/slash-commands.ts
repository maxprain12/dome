import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';

import type { SlashIconId } from '@/lib/tiptap/slash-icons';

export type SlashCommandCategory = 'Texto' | 'Listas' | 'Bloques Dome' | 'AI' | 'Embebidos';

export interface SlashCommand {
  title: string;
  description: string;
  iconId: SlashIconId;
  /** Category for grouping in the slash menu */
  category: SlashCommandCategory;
  /** Shown in menu header (same as category by default) */
  group: string;
  /** AI items get olive accent styling */
  accent?: boolean;
  command: (editor: Editor) => void;
}

const pasteImageFromClipboard = async (editor: Editor) => {
  try {
    const clipItems = await navigator.clipboard.read();
    for (const item of clipItems) {
      const imgType = item.types.find((t) => t.startsWith('image/'));
      if (!imgType) continue;
      const blob = await item.getType(imgType);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('read'));
        r.readAsDataURL(blob);
      });
      editor.chain().focus().setImage({ src: dataUrl }).run();
      return;
    }
  } catch {
    /* clipboard API unavailable or denied */
  }
};

export const SLASH_ITEMS: SlashCommand[] = [
  // ── Texto
  {
    title: 'Texto',
    description: 'Párrafo normal',
    iconId: 'text',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: 'Heading 1',
    description: 'Título grande',
    iconId: 'h1',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Subtítulo',
    iconId: 'h2',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Sub-subtítulo',
    iconId: 'h3',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Cita',
    description: 'Bloque de cita destacado',
    iconId: 'quote',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  // ── Listas
  {
    title: 'Lista con viñetas',
    description: 'Lista no ordenada',
    iconId: 'bullet-list',
    category: 'Listas',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Lista numerada',
    description: 'Lista ordenada',
    iconId: 'ordered-list',
    category: 'Listas',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'To-do',
    description: 'Lista con checkboxes',
    iconId: 'task-list',
    category: 'Listas',
    group: 'Listas',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  // ── Bloques Dome
  {
    title: 'Callout',
    description: 'Nota destacada con icono',
    iconId: 'callout',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) => editor.chain().focus().setCallout({ variant: 'info' }).run(),
  },
  {
    title: 'Toggle',
    description: 'Bloque plegable',
    iconId: 'toggle',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) => editor.chain().focus().setToggle({ collapsed: false }).run(),
  },
  {
    title: 'Código',
    description: 'Bloque de código con syntax',
    iconId: 'code',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Divisor',
    description: 'Línea horizontal',
    iconId: 'divider',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Columnas',
    description: 'Layout en 2 o 3 columnas',
    iconId: 'columns',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) => editor.chain().focus().insertTwoColumns().run(),
  },
  {
    title: 'Tabla',
    description: 'Tabla editable',
    iconId: 'table',
    category: 'Bloques Dome',
    group: 'Bloques Dome',
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  // ── AI
  {
    title: 'Pedir a Many',
    description: 'Genera contenido desde un prompt',
    iconId: 'ai-spark',
    category: 'AI',
    group: 'AI',
    accent: true,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'aiBlock', attrs: { prompt: '', response: '', status: 'idle' } })
        .run(),
  },
  {
    title: 'Continuar escribiendo',
    description: 'Many continúa el texto',
    iconId: 'ai-continue',
    category: 'AI',
    group: 'AI',
    accent: true,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'aiBlock', attrs: { prompt: 'Continúa el texto anterior de forma natural', response: '', status: 'idle' } })
        .run(),
  },
  {
    title: 'Resumen del documento',
    description: 'Resumen ejecutivo automático',
    iconId: 'ai-summary',
    category: 'AI',
    group: 'AI',
    accent: true,
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({ type: 'aiBlock', attrs: { prompt: 'Genera un resumen ejecutivo de este documento', response: '', status: 'idle' } })
        .run(),
  },
  // ── Embebidos
  {
    title: 'Imagen',
    description: 'Subir o pegar URL',
    iconId: 'image',
    category: 'Embebidos',
    group: 'Embebidos',
    command: (editor) => editor.storage.noteEditorBridge.openImagePicker(),
  },
  {
    title: 'Mencionar @',
    description: 'Añadir recurso del workspace',
    iconId: 'mention',
    category: 'Embebidos',
    group: 'Embebidos',
    command: (editor) => editor.chain().focus().insertContent('@').run(),
  },
  {
    title: 'Embed',
    description: 'YouTube, iframe, Figma…',
    iconId: 'embed',
    category: 'Embebidos',
    group: 'Embebidos',
    command: (editor) => editor.storage.noteEditorBridge.openEmbedModal('youtube'),
  },
];

/** Back-compat — prefer {@link SLASH_ITEMS}. */
export const SLASH_COMMANDS = SLASH_ITEMS;

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
          if (!q) return SLASH_ITEMS;
          return SLASH_ITEMS.filter((cmd) =>
            [cmd.title, cmd.description, cmd.category, cmd.group].some((s) => s.toLowerCase().includes(q)),
          );
        },
        command: ({ editor, range, props }: { editor: Editor; range: unknown; props: SlashCommand }) => {
          editor.chain().focus().deleteRange(range as { from: number; to: number }).run();
          props.command(editor);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    const suggestion = (this.options.suggestion ?? {}) as Partial<SuggestionOptions<SlashCommand>>;
    const { editor: _ignoreEditorFromOptions, ...suggestionRest } = suggestion;
    return [
      Suggestion({
        ...suggestionRest,
        editor: this.editor,
      } as SuggestionOptions<SlashCommand>),
    ];
  },
});
