# Editor Feature (Tiptap / Notion-style)

Documentation for Dome's rich-text editor: Tiptap-based `NoteEditor`, custom blocks, slash commands, mention picker, and AI blocks. Lives in `app/components/editor/` and `app/lib/tiptap/`; types in `app/types/index.ts`.

---

## Interfaces

### Block attributes (`app/types/index.ts`)

```ts
interface CalloutBlockAttributes {
  icon?: string;
  color?: string;
  variant?: 'info' | 'warning' | 'error' | 'success' | 'olive';
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

interface VideoEmbedAttributes {
  src: string;
  provider?: 'youtube' | 'direct';
  videoId?: string;
}

interface AudioEmbedAttributes {
  src: string;
  isLocal?: boolean;
}
```

> **Note:** `PDFEmbedAttributes` and `FileBlockAttributes` are declared in
> `app/types/index.ts` but **no Tiptap extension currently implements them** —
> they are reserved for future PDF / file-block nodes. All other interfaces map
> 1:1 to a real extension under `app/lib/tiptap/extensions/`.

### NoteEditor props (`app/components/editor/NoteEditor.tsx`)

```ts
interface NoteEditorProps {
  /** Initial editor content — Tiptap JSON or legacy HTML fallback. */
  content?: JSONContent | string;
  editable?: boolean;
  placeholder?: string;
  projectId?: string;
  currentResourceId?: string;
  /** Distraction-free / zen typing: wider column, serif, extra AI shortcuts. */
  zenMode?: boolean;
  /** Legacy alias — behaves like zenMode when set. */
  focused?: boolean;
  /** When true, Dome resource links/mentions open in split instead of replacing the tab. */
  splitLinkNav?: boolean;
  /** Floating "+" insert menu — Tweaks may disable it. */
  showFloatingInsert?: boolean;
  onInsertAiBlock?: () => void;
  onUpdate?: (json: JSONContent) => void;
  onEditorReady?: (editor: Editor) => void;
}
```

### Slash command items (`app/lib/tiptap/slash-commands.ts`)

```ts
type SlashCommandCategory = 'Texto' | 'Listas' | 'Bloques Dome' | 'AI' | 'Embebidos';

interface SlashCommand {
  title: string;
  description: string;
  iconId: SlashIconId;
  category: SlashCommandCategory;
  group: string;
  accent?: boolean;          // AI items get olive accent styling
  command: (editor: Editor) => void;
}
```

The `/` trigger is wired through `@tiptap/suggestion` inside
`SlashCommandExtension` (`app/lib/tiptap/slash-commands.ts`); the menu UI lives
in `app/components/editor/SlashCommandMenu.tsx` (rendered via a portal). State
(filter, selected index, keyboard nav) is owned locally by the menu component,
not by a separate plugin store.

---

## Design patterns

### Tiptap stack

- **Core**: `useEditor` from `@tiptap/react` with `content` (JSON or legacy
  HTML), `editable`, `onUpdate` (calls `onUpdate(editor.getJSON())`).
- **Extensions** — composed in `app/lib/tiptap/extensions.ts` via
  `buildCoreNoteExtensions({ placeholder })`:
  - `@tiptap/starter-kit` (headings 1–3, lists, blockquote, codeBlock **disabled**, dropcursor **disabled** — drag handle drives DnD instead)
  - `Underline`, `TextStyle`, `Color`, `Highlight` (multicolor)
  - `Link` (openOnClick: false, autolink, target=_blank rel=noopener noreferrer)
  - `Image` (inline: false, allowBase64: true)
  - `TextAlign` (heading + paragraph)
  - `Typography`
  - `TaskList` + `TaskItem` (nested: true)
  - `Table` + `TableRow` + `TableHeader` + `TableCell` (resizable)
  - `Placeholder`
  - `Youtube` (640×360, nocookie)
  - `UniqueID` (assigned to every block-level node for stable IDs)
  - `NodeRange` (used by column layouts + multi-block selection)
  - Plus all custom nodes listed below.
- **Composed in `NoteEditor.tsx` (not in `buildCoreNoteExtensions`)**: the
  `SlashCommandExtension`, and the mention picker
  (`buildDomeResourceMention` from `app/lib/tiptap/extensions/resource-mention`).
- **Custom nodes**: each uses `Node.create()`, `addAttributes()` with
  `parseHTML` / `renderHTML`. React node views are mounted via
  `ReactNodeViewRenderer(<View>)` only for nodes that need imperative handles
  (`AIBlock`, `DomeCodeBlockLowlight`); the rest render pure HTML/CSS in
  `note-editor.css`.

### Custom extensions (`app/lib/tiptap/extensions/`)


| Extension                         | Node name           | Content | Role                                                                              |
| --------------------------------- | ------------------- | ------- | --------------------------------------------------------------------------------- |
| `Callout`                         | `callout`           | block+  | Highlighted note with icon/color/variant (`data-icon`, `data-color`, `data-variant`) |
| `ToggleBlock` / `ToggleSummary` / `ToggleBody` | `toggleBlock` (+ `toggleSummary`, `toggleBody`) | block+ | Collapsible section (`data-collapsed`)                                |
| `StyledDivider`                   | `styledDivider`     | -       | Horizontal divider (`data-variant`: line / dots / space)                          |
| `Column` / `TwoColumnLayout` / `ThreeColumnLayout` / `ColumnLayoutCommands` | `column`, `twoColumnLayout`, `threeColumnLayout` | block+ | Two/three-column layout block                                            |
| `ResourceLink`                    | `resourceLink`      | inline  | Inline chip linking to a Dome resource (`data-resource-id`, `data-title`, `data-resource-type`) |
| `ResourceMention` (`buildDomeResourceMention`) | `resourceMention` | inline  | `@mention` picker via Tiptap suggestion → opens MentionSuggestionMenu             |
| `IframeEmbed`                     | `iframeEmbed`       | -       | Generic `<iframe>` embed (Figma, Excalidraw stubs, etc.)                          |
| `AIBlock`                         | `aiBlock`           | -       | AI prompt + response block (React node view, runs Many actions)                   |
| `DomeCodeBlockLowlight`           | `codeBlock`         | block+  | Code block with syntax highlighting via `lowlight` (React node view)              |
| `NoteEditorBridge`                | -                   | -       | Storage extension — exposes `openImagePicker`, `openEmbedModal`, `openResourcePicker` to slash commands |
| `YouTube`                         | `youtube`           | -       | YouTube embed (from `@tiptap/extension-youtube`, nocookie)                        |
| `UniqueID`                        | -                   | -       | Assigns stable IDs to block-level nodes                                           |
| `NodeRange`                       | -                   | -       | Multi-block range selection (drives column ops)                                   |


### Slash commands

- **Trigger**: `/` via `@tiptap/suggestion` (no custom plugin — standard
  suggestion plumbing). `allowSpaces: false`, `startOfLine: false`.
- **Items**: `SLASH_ITEMS` in `app/lib/tiptap/slash-commands.ts`, grouped into
  categories **Texto · Listas · Bloques Dome · AI · Embebidos**.
- **Menu**: `SlashCommandMenu.tsx` renders a portal at the caret rect; local
  filter input + keyboard (↑/↓ to move, Enter to run, Esc to dismiss). Items
  run `command(editor)` directly — no `{ editor, range }` shim is needed
  because the suggestion plugin already deletes the trigger range.
- **Notable commands**: `setCallout`, `setToggle`, `setHorizontalRule`,
  `toggleCodeBlock`, `insertTwoColumns`, `insertTable(3×3)`,
  `insertContent({ type: 'aiBlock', … })`, open image/embed pickers via
  `editor.storage.noteEditorBridge`.

### Menus (renderer)

- **`NoteBubbleMenu`** (`NoteBubbleMenu.tsx`): appears on a non-empty text
  selection; exposes bold / italic / underline / link / highlight / color, plus
  the `NoteLinkPopoverField` link editor.
- **`NoteFloatingInsertMenu`** (`NoteFloatingInsertMenu.tsx`): appears when the
  caret sits at the start of an empty paragraph — quick-insert buttons
  (`+`). Toggled by `showFloatingInsert` prop.
- **`SlashCommandMenu`** (`SlashCommandMenu.tsx`): portal at caret; arrow-key
  nav, filter input, runs `SlashCommand.command`.
- **`MentionSuggestionMenu`** (`MentionSuggestionMenu.tsx`): portal for the
  `@` resource picker (suggestion plugin inside `buildDomeResourceMention`).
- **`NoteToolbar`** (`NoteToolbar.tsx`): top toolbar (mark buttons + link
  prompt) for the non-floating toolset; shown above the editor by parents
  (e.g. note workspace).
- **`NoteDragHandle`** (`NoteDragHandle.tsx`): wraps
  `@tiptap/extension-drag-handle-react` to render the block drag handle and an
  inline `+` (insert) button on hover. **Not a content extension** — purely a
  React UI that mutates the editor via `chain()` commands.
- **Modals** (also part of the editor UI): `ResourcePickerModal`,
  `ImagePickerModal`, `EmbedModal` — opened from slash commands or the bubble
  menu via `editor.storage.noteEditorBridge`.

### File & image insertion

- The editor **does not** bind a native `onDrop` on the wrapper. Files are
  inserted via the pickers / slash commands, not by dropping onto the canvas:
  - **Image**: slash → `Imagen` → `ImagePickerModal` → `editor.chain().setImage({ src }).run()`.
  - **YouTube / iframe**: slash → `Embed` → `EmbedModal` (mode `youtube` /
    `iframe`) → inserts `youtube` or `iframeEmbed` node.
  - **Paste**: clipboard image paste is handled inside `slash-commands.ts`
    (`pasteImageFromClipboard`) via `navigator.clipboard.read` → `setImage`.
- Resource links / mentions use the `ResourcePickerModal` (opened from the
  bubble link button or via the `@` mention plugin), which inserts a
  `ResourceLink` or `ResourceMention` node referencing the chosen Dome
  resource.

---

## Data flow

- **Init**: `NoteEditor` receives `content` (Tiptap `JSONContent` or legacy
  HTML fallback), passes it to `useEditor`; `onUpdate` calls
  `onUpdate(editor.getJSON())` — **JSON, not HTML** (the previous HTML
  serialisation has been retired).
- **Persistence**: the parent workspace serialises the JSON and saves via the
  resource payload (`NotePersistencePayload` in `app/types/contracts.ts`,
  re-exported from `app/types/index.ts`).
- **Resource mentions / links**: store `resourceId`, `title`, `type`. Click
  handler in `NoteEditor.tsx` opens the resource via `useTabStore`
  (`openResourceTab` or `openResourceInSplit`, depending on `splitLinkNav`).
- **AI blocks**: `AIBlock` node stores `prompt`, `response`, `status`; the
  React node view calls `executeEditorAIAction` (from `app/lib/ai/editor-ai`)
  to invoke Many actions (continue / summarize / custom prompt).
- **Block IDs**: `UniqueID` assigns a stable id to every block-level node,
  used by drag-and-drop reordering, slash-menu position restoration, and
  `NodeRange` selection.

---

## Functionality

- **Rich text**: headings 1–3, lists, task lists (nested), tables (resizable),
  code blocks (`lowlight` syntax highlighting), blockquote, links, images
  (allowBase64), underline, highlight (multicolor), text color, alignment.
- **Callout**: insert via slash; `variant` (`info | warning | error | success
  | olive`), `icon`, `color` attributes; block+ content.
- **Toggle**: collapsible block+; `collapsed` attribute; rendered as
  `toggleSummary` + `toggleBody` pair.
- **Divider**: line / dots / space (variant attribute).
- **Column layouts**: 2- or 3-column block+ with inline `Column` children,
  inserted via slash (`Columnas`) or commands.
- **Iframe embed**: generic iframe (Figma, etc.) via `IframeEmbed`.
- **YouTube embed**: via `@tiptap/extension-youtube` (nocookie).
- **Resource link**: inline chip pointing at another Dome resource
  (note / pdf / video / …); clicking opens it via `useTabStore`.
- **Resource mention**: `@` picker driven by
  `buildDomeResourceMention`; suggestions sourced from
  `app/lib/resources` (search); inserts a `resourceMention` node.
- **AI block**: prompt + response block with regenerate / insert / replace
  actions, rendered through `AIBlockNodeView` (`AIBlockNodeView.tsx`).
- **Drag handle**: `NoteDragHandle` (via `@tiptap/extension-drag-handle-react`)
  reorders blocks and exposes an inline `+` button.
- **Slash commands**: `/` opens the menu; categories Texto / Listas / Bloques
  Dome / AI / Embebidos; run command to insert / wrap.
- **Floating insert menu**: shows when caret is on an empty line; quick
  insert buttons.
- **Bubble menu**: bold / italic / underline / link / highlight / color.

---

## Key files


| Path                                                     | Role                                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app/components/editor/NoteEditor.tsx`                   | Main Tiptap editor — `useEditor` config, extension composition (core + slash + mention), `onUpdate` JSON, `NoteBubbleMenu`, `NoteFloatingInsertMenu`, `NoteDragHandle`, resource link/mention click routing |
| `app/components/editor/note-editor.css`                  | Editor styles (callout variants, code block, drag handle, AI block, resource link/mention, slash menu anchors)                        |
| `app/components/editor/index.ts`                         | Re-exports `NoteEditor` and `NoteToolbar`                                                                                             |
| `app/components/editor/NoteBubbleMenu.tsx`               | Bubble menu (bold / italic / underline / link / highlight / color) + `NoteLinkPopoverField` link editor                              |
| `app/components/editor/NoteFloatingInsertMenu.tsx`       | Floating "+" insert menu on empty lines                                                                                              |
| `app/components/editor/NoteDragHandle.tsx`               | Drag handle + inline `+` insert button (wraps `@tiptap/extension-drag-handle-react`)                                                |
| `app/components/editor/NoteToolbar.tsx`                  | Top toolbar (mark buttons, link prompt)                                                                                              |
| `app/components/editor/SlashCommandMenu.tsx`             | Slash menu portal — filter input, keyboard nav, runs `SlashCommand.command`                                                          |
| `app/components/editor/MentionSuggestionMenu.tsx`        | `@` mention picker portal                                                                                                            |
| `app/components/editor/ResourcePickerModal.tsx`          | Modal to pick a Dome resource for link / split / mention                                                                             |
| `app/components/editor/ImagePickerModal.tsx`             | Modal to pick / upload an image                                                                                                      |
| `app/components/editor/EmbedModal.tsx`                   | Modal for YouTube / iframe / Figma embeds                                                                                            |
| `app/components/editor/CodeBlockNoteView.tsx`            | React node view for code blocks (syntax highlight, copy button)                                                                      |
| `app/components/editor/AIBlockNodeView.tsx`              | React node view for AI blocks (prompt / response / actions)                                                                          |
| `app/components/editor/BubbleAnchoredSubmenu.tsx`        | Anchored submenu helper used by the bubble menu                                                                                      |
| `app/components/editor/useSelectionBubblePosition.ts`    | Hook — bubble menu anchor positioning                                                                                                |
| `app/components/editor/useSuggestionPortalPosition.ts`   | Hook — slash / mention portal positioning                                                                                            |
| `app/lib/tiptap/extensions.ts`                           | `buildCoreNoteExtensions({ placeholder })` — composes the @tiptap stack + custom nodes                                                |
| `app/lib/tiptap/slash-commands.ts`                       | `SLASH_ITEMS`, `SlashCommand` type, `SlashCommandExtension` (Tiptap suggestion wiring)                                                |
| `app/lib/tiptap/slash-icons.tsx`                         | `SlashCommandIcon` + `SlashIconId` (icon set for slash menu)                                                                         |
| `app/lib/tiptap/ai-actions.ts`                           | `createTipTapAIActions` — bridges editor commands to Many AI actions                                                                 |
| `app/lib/tiptap/types.ts`                                | Tiptap-related shared types                                                                                                          |
| `app/lib/tiptap/utils.ts`                                | Editor utilities                                                                                                                      |
| `app/lib/tiptap/extensions/callout.ts`                   | `Callout` extension                                                                                                                  |
| `app/lib/tiptap/extensions/toggle-block.ts`              | `ToggleBlock` + `ToggleSummary` + `ToggleBody`                                                                                       |
| `app/lib/tiptap/extensions/styled-divider.ts`            | `StyledDivider`                                                                                                                       |
| `app/lib/tiptap/extensions/column-layout.ts`             | `Column`, `TwoColumnLayout`, `ThreeColumnLayout`, `ColumnLayoutCommands`                                                              |
| `app/lib/tiptap/extensions/resource-link.ts`             | `ResourceLink` (inline chip)                                                                                                          |
| `app/lib/tiptap/extensions/resource-mention.ts`          | `buildDomeResourceMention` (mention picker via Tiptap suggestion)                                                                    |
| `app/lib/tiptap/extensions/iframe-embed.ts`              | `IframeEmbed`                                                                                                                         |
| `app/lib/tiptap/extensions/ai-block.ts`                  | `AIBlock` (React node view)                                                                                                          |
| `app/lib/tiptap/extensions/code-block-note-view-extension.ts` | `DomeCodeBlockLowlight` — code block with lowlight syntax highlighting + React node view                                       |
| `app/lib/tiptap/extensions/note-editor-bridge.ts`        | `NoteEditorBridge` — storage extension exposing `openImagePicker`, `openEmbedModal`, `openResourcePicker` to slash commands          |
| `app/types/index.ts`                                     | Block-attribute interfaces (Callout, Toggle, PDFEmbed\*, FileBlock\*, Divider, VideoEmbed, AudioEmbed, ResourceMention)             |

\* `PDFEmbedAttributes` and `FileBlockAttributes` are declared in
`app/types/index.ts` but **no Tiptap extension currently implements them** —
reserved for future nodes.