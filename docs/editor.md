# Editor Feature (Tiptap / Notion-style)

Documentation for Dome's rich-text editor: Tiptap-based NotionEditor, custom blocks, slash commands, and file drop. Lives in `app/components/editor/`, `app/components/Editor.tsx`, and types in `app/types/index.ts`.

---

## Interfaces

### Block attributes (`app/types/index.ts`)

```ts
interface CalloutBlockAttributes {
  icon?: string;
  color?: string;
}

interface ToggleBlockAttributes {
  collapsed?: boolean;
}

interface PDFEmbedAttributes {
  resourceId: string;
  pageStart?: number;
  pageEnd?: number;
  zoom?: number;
}

interface ResourceMentionAttributes {
  resourceId: string;
  title: string;
  type: ResourceType;
}

interface FileBlockAttributes {
  resourceId: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

interface DividerAttributes {
  variant?: 'line' | 'dots' | 'space';
}
```

### NotionEditor props (`app/components/editor/NotionEditor.tsx`)

```ts
interface NotionEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
}
```

### Slash command state (`app/components/editor/extensions/SlashCommandPlugin.ts`, SlashCommand.tsx)

```ts
interface SlashCommandState {
  show: boolean;
  items: SlashCommandItem[];
  selectedIndex: number;
  query: string;
  range: { from: number; to: number } | null;
}

interface SlashCommandItem {
  title: string;
  description?: string;
  category: string;
  command: (props: { editor: Editor; range: Range }) => void;
  icon?: React.ReactNode;
  keywords?: string[];
}
```

---

## Design patterns

### Tiptap stack

- **Core**: `useEditor` from `@tiptap/react` with `content`, `editable`, `onUpdate` (calls `onChange(editor.getHTML())`).
- **Extensions**: StarterKit (headings 1–3, dropcursor disabled), Dropcursor, Gapcursor, Typography, Underline, TextStyle, Color, TextAlign, Table (resizable), TaskList/TaskItem, Highlight, Link, Image, CodeBlockLowlight, Placeholder, plus custom nodes below.
- **Custom nodes**: Callout, Toggle, Divider, PDFEmbed, ResourceMention, FileBlock; each uses `Node.create()`, `addAttributes()`, `parseHTML`/`renderHTML`, and React node view via `ReactNodeViewRenderer(BlockComponent)`.

### Custom extensions (app/components/editor/extensions/)

| Extension | Node name | Content | Role |
|-----------|-----------|---------|------|
| CalloutExtension | `callout` | block+ | Colored callout with icon (data-icon, data-color) |
| ToggleExtension | `toggle` | block+ | Collapsible section (collapsed attr) |
| DividerExtension | `divider` | - | Horizontal divider (variant: line/dots/space) |
| PDFEmbedExtension | `pdfEmbed` | - | Inline PDF page(s) (resourceId, pageStart, pageEnd, zoom) |
| ResourceMentionExtension | `resourceMention` | - | @mention linking to resource (resourceId, title, type) |
| FileBlockExtension | `fileBlock` | - | Embedded file reference (resourceId, filename, mimeType, size) |
| DragHandleExtension | - | - | Drag handle for reordering blocks |
| SlashCommandExtension | - | - | Plugin: on "/" opens command menu; commands from getSlashCommandItems() |

### Slash commands

- **Plugin**: Listens for "/" and filters items by query; exposes state (show, items, selectedIndex, query, range).
- **Menu**: SlashCommandMenu reads plugin state, renders grouped items, keyboard (Enter to run, Arrow keys), runs `item.command({ editor, range })`.
- **Items**: getSlashCommandItems() returns headings, lists, callout, toggle, divider, image, PDF embed, file block, resource mention, etc.

### Menus

- **BubbleMenu**: Shows on text selection (bold, italic, underline, link, highlight, color).
- **FloatingMenu**: Shows when selection is empty (e.g. insert block).
- **SlashCommandMenu**: Positioned at cursor; fixed; categories from getSlashCommandItems().

### File drop (NotionEditor)

- **Handler**: onDrop on wrapper div; preventDefault; for each file: `window.electron.getPathForFile(file)` → determine type by extension → `window.electron.resource.import(filePath, projectId, type, title)`.
- **Insert**: If image: setImage with readFile data URL; if PDF: setPDFEmbed(resourceId, pageStart, zoom); else setFileBlock(resourceId, filename, mimeType, size).

---

## Data flow

- **Init**: NotionEditor receives content (HTML string), passes to useEditor; onUpdate calls onChange(editor.getHTML()).
- **Persistence**: Parent (e.g. note workspace) saves content via db.resources.update(id, { content: html }) or similar.
- **Resource mentions**: ResourceMention node stores resourceId/title/type; rendering can link to `/workspace/{id}`; backlinks via db.resources.getBacklinks(id).
- **PDF/File blocks**: Store resourceId; viewer resolution by resource type in workspace.

---

## Functionality

- **Rich text**: Headings, lists, task lists, tables, code blocks (lowlight), links, images, underline, highlight, text color, alignment.
- **Callout**: Insert via slash; icon and color attributes; block+ content.
- **Toggle**: Collapsible block+; collapsed attribute.
- **Divider**: Line / dots / space.
- **PDF embed**: Inline embed of PDF resource pages (resourceId, page range, zoom).
- **Resource mention**: @mention picker (search via db.resources.searchForMention); inserts resourceMention node.
- **File block**: Reference to imported file resource (open in workspace by resourceId).
- **Drag handle**: Reorder blocks (DragHandle extension).
- **Slash commands**: "/" opens menu; categories; run command to insert or wrap.
- **File drop**: Drop files → import via IPC → insert image / PDF embed / file block.

---

## Key files

| Path | Role |
|------|------|
| `app/components/editor/NotionEditor.tsx` | useEditor config, extensions, onUpdate, file drop, BubbleMenu/FloatingMenu/SlashCommandMenu |
| `app/components/Editor.tsx` | Wrapper around NotionEditor (e.g. for note page) |
| `app/components/editor/extensions/Callout.ts` | CalloutExtension; CalloutBlock React view |
| `app/components/editor/extensions/Toggle.ts` | ToggleExtension; ToggleBlock React view |
| `app/components/editor/extensions/Divider.ts` | DividerExtension |
| `app/components/editor/extensions/PDFEmbed.ts` | PDFEmbedExtension; PDFEmbedBlock React view |
| `app/components/editor/extensions/ResourceMention.ts` | ResourceMentionExtension; ResourceMentionBlock React view |
| `app/components/editor/extensions/FileBlock.ts` | FileBlockExtension; FileBlock React view |
| `app/components/editor/extensions/DragHandle.ts` | DragHandleExtension |
| `app/components/editor/extensions/SlashCommand.ts` | SlashCommandExtension config; getSlashCommandItems() |
| `app/components/editor/extensions/SlashCommandPlugin.ts` | Plugin state for "/" and filter |
| `app/components/editor/SlashCommand.tsx` | SlashCommandMenu UI, keyboard, run command |
| `app/components/editor/FloatingMenu.tsx` | Floating menu UI |
| `app/components/editor/BubbleMenu.tsx` | Bubble menu UI |
| `app/types/index.ts` | CalloutBlockAttributes, ToggleBlockAttributes, PDFEmbedAttributes, ResourceMentionAttributes, FileBlockAttributes, DividerAttributes |
