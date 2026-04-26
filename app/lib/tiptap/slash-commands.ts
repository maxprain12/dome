import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionOptions } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/core';

export type SlashCommandCategory = 'Texto' | 'Multimedia' | 'Estructura' | 'Dome';

export interface SlashCommand {
  title: string;
  description: string;
  icon: string;
  /** Category for grouping in the slash menu */
  category: SlashCommandCategory;
  /** Shown in menu header (same as category by default) */
  group: string;
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

export const SLASH_COMMANDS: SlashCommand[] = [
  // ── Texto
  {
    title: 'Texto',
    description: 'Párrafo normal',
    icon: '¶',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    title: 'Título 1',
    description: 'Sección grande',
    icon: 'H1',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Título 2',
    description: 'Sección mediana',
    icon: 'H2',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Título 3',
    description: 'Sección pequeña',
    icon: 'H3',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Callout información',
    description: 'Aviso informativo',
    icon: 'ℹ',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setCallout({ variant: 'info' }).run(),
  },
  {
    title: 'Callout aviso',
    description: 'Advertencia',
    icon: '⚠',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setCallout({ variant: 'warning' }).run(),
  },
  {
    title: 'Callout error',
    description: 'Mensaje de error',
    icon: '✕',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setCallout({ variant: 'error' }).run(),
  },
  {
    title: 'Callout éxito',
    description: 'Confirmación positiva',
    icon: '✓',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setCallout({ variant: 'success' }).run(),
  },
  {
    title: 'Toggle',
    description: 'Bloque colapsable',
    icon: '▸',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().setToggle({ collapsed: false }).run(),
  },
  {
    title: 'Cita',
    description: 'Bloque de cita',
    icon: '"',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Código',
    description: 'Bloque de código',
    icon: '</>',
    category: 'Texto',
    group: 'Texto',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  // ── Multimedia
  {
    title: 'Imagen (portapapeles)',
    description: 'Pegar imagen desde el portapapeles',
    icon: '📋',
    category: 'Multimedia',
    group: 'Multimedia',
    command: (editor) => void pasteImageFromClipboard(editor),
  },
  {
    title: 'Imagen (Dome)',
    description: 'Elegir imagen de la librería',
    icon: '🖼',
    category: 'Multimedia',
    group: 'Multimedia',
    command: (editor) => editor.storage.noteEditorBridge.openImagePicker(),
  },
  {
    title: 'YouTube',
    description: 'Insertar vídeo de YouTube',
    icon: '▶',
    category: 'Multimedia',
    group: 'Multimedia',
    command: (editor) => editor.storage.noteEditorBridge.openEmbedModal('youtube'),
  },
  {
    title: 'Iframe / embed',
    description: 'Insertar página incrustada (URL)',
    icon: '▢',
    category: 'Multimedia',
    group: 'Multimedia',
    command: (editor) => editor.storage.noteEditorBridge.openEmbedModal('iframe'),
  },
  // ── Estructura
  {
    title: 'Lista',
    description: 'Lista con viñetas',
    icon: '•',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Lista numerada',
    description: 'Lista ordenada',
    icon: '1.',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Lista de tareas',
    description: 'Con checkboxes',
    icon: '☐',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Separador',
    description: 'Línea horizontal clásica',
    icon: '—',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Separador ···',
    description: 'Puntos decorativos',
    icon: '···',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().setDivider({ variant: 'dots' }).run(),
  },
  {
    title: 'Separador espacio',
    description: 'Espacio vertical amplio',
    icon: '⎵',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().setDivider({ variant: 'space' }).run(),
  },
  {
    title: '2 columnas',
    description: 'Dos columnas paralelas',
    icon: '⫯',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().insertTwoColumns().run(),
  },
  {
    title: '3 columnas',
    description: 'Tres columnas paralelas',
    icon: '▥',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) => editor.chain().focus().insertThreeColumns().run(),
  },
  {
    title: 'Tabla',
    description: 'Tabla 3×3',
    icon: '⊞',
    category: 'Estructura',
    group: 'Estructura',
    command: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  // ── Dome
  {
    title: 'Referencia a recurso',
    description: 'Enlace a nota o archivo de Dome',
    icon: '⌘',
    category: 'Dome',
    group: 'Dome',
    command: (editor) => editor.storage.noteEditorBridge.openResourcePicker('link'),
  },
  {
    title: 'Mención @…',
    description: 'Insertar @ para buscar recursos',
    icon: '@',
    category: 'Dome',
    group: 'Dome',
    command: (editor) => editor.storage.noteEditorBridge.openResourcePicker('mention'),
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
          return SLASH_COMMANDS.filter((cmd) =>
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
