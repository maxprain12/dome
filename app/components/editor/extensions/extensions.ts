import { markInputRule } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Code } from "@tiptap/extension-code";
import { TextAlign } from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Superscript } from "@tiptap/extension-superscript";
import SubScript from "@tiptap/extension-subscript";
import { Typography } from "@tiptap/extension-typography";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import { Youtube } from "@tiptap/extension-youtube";
import SlashCommand from "@/components/editor/extensions/slash-command";
import {
  Details,
  DetailsContent,
  DetailsSummary,
  MathBlock,
  MathInline,
  TableCell,
  TableRow,
  TableHeader,
  CustomTable,
  TrailingNode,
  TiptapImage,
  Callout,
  TiptapVideo,
  LinkExtension,
  Selection,
  Attachment,
  CustomCodeBlock,
  Embed,
  SearchAndReplace,
  Mention,
  TableDndExtension,
  Heading,
  Highlight,
  UniqueID,
  SharedStorage,
  Columns,
  Column,
  Status
} from "@docmost/editor-ext";
import {
  createImageHandle,
  imageResizeClasses,
} from "@/components/editor/components/image/image-resize-handles.ts";
import {
  createResizeHandle,
  buildResizeClasses,
} from "@/components/editor/components/common/node-resize-handles.ts";
import MathInlineView from "@/components/editor/components/math/math-inline.tsx";
import MathBlockView from "@/components/editor/components/math/math-block.tsx";
import ImageView from "@/components/editor/components/image/image-view.tsx";
import CalloutView from "@/components/editor/components/callout/callout-view.tsx";
import StatusView from "@/components/editor/components/status/status-view.tsx";
import VideoView from "@/components/editor/components/video/video-view.tsx";
import AttachmentView from "@/components/editor/components/attachment/attachment-view.tsx";
import CodeBlockView from "@/components/editor/components/code-block/code-block-view.tsx";
import EmbedView from "@/components/editor/components/embed/embed-view.tsx";
import { common, createLowlight } from "lowlight";
import plaintext from "highlight.js/lib/languages/plaintext";
import powershell from "highlight.js/lib/languages/powershell";
import elixir from "highlight.js/lib/languages/elixir";
import erlang from "highlight.js/lib/languages/erlang";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import clojure from "highlight.js/lib/languages/clojure";
import haskell from "highlight.js/lib/languages/haskell";
import scala from "highlight.js/lib/languages/scala";
import mentionRenderItems from "@/components/editor/components/mention/mention-suggestion.ts";
import { ReactNodeViewRenderer } from "@tiptap/react";
import MentionView from "@/components/editor/components/mention/mention-view.tsx";
import { Markdown } from "@tiptap/markdown";
import { MarkdownClipboard } from "@/components/editor/extensions/markdown-clipboard.ts";
import EmojiCommand from "./emoji-command";

const lowlight = createLowlight(common);
lowlight.register("mermaid", plaintext);
lowlight.register("powershell", powershell);
lowlight.register("erlang", erlang);
lowlight.register("elixir", elixir);
lowlight.register("dockerfile", dockerfile);
lowlight.register("clojure", clojure);
lowlight.register("haskell", haskell);
lowlight.register("scala", scala);

// @ts-ignore
export const mainExtensions = [
  StarterKit.configure({
    heading: false,
    undoRedo: false,
    link: false,
    trailingNode: false,
    dropcursor: {
      width: 3,
      color: "#70CFF8",
    },
    codeBlock: false,
    code: false,
  }),
  // Override TipTap's Code extension to fix the inline code input rule.
  Code.configure({
    HTMLAttributes: {
      spellcheck: false,
    },
  }).extend({
    addInputRules() {
      return [
        markInputRule({
          find: /(?:^|(?<=[^`]))`([^`]+)`(?!`)$/,
          type: this.type,
        }),
      ];
    },
  }),
  SharedStorage,
  Heading,
  UniqueID.configure({
    types: ["heading", "paragraph"],
  }),
  Placeholder.configure({
    placeholder: ({ node }: { node: any }) => {
      if (node.type.name === "heading") {
        return `Título ${node.attrs.level}`;
      }
      if (node.type.name === "detailsSummary") {
        return "Título del toggle";
      }
      if (node.type.name === "paragraph") {
        return 'Escribe algo. Pulsa "/" para comandos';
      }
      return "";
    },
    includeChildren: true,
    showOnlyWhenEditable: true,
  }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  LinkExtension.configure({
    openOnClick: false,
  }),
  Superscript,
  SubScript,
  Highlight.configure({
    multicolor: true,
  }),
  Typography,
  TrailingNode,
  GlobalDragHandle,
  TextStyle,
  Color,
  SlashCommand,
  EmojiCommand,
  Mention.configure({
    suggestion: {
      allowSpaces: true,
      items: () => {
        return [];
      },
      // @ts-ignore
      render: mentionRenderItems,
    },
    HTMLAttributes: {
      class: "mention",
    },
  }).extend({
    addNodeView() {
      // Force the react node view to render immediately
      this.editor.isInitialized = true;
      return ReactNodeViewRenderer(MentionView);
    },
  }),
  CustomTable.configure({
    resizable: true,
    lastColumnResizable: true,
    allowTableNodeSelection: true,
  }),
  TableRow,
  TableCell,
  TableHeader,
  TableDndExtension,
  MathInline.configure({
    view: MathInlineView,
  }),
  MathBlock.configure({
    view: MathBlockView,
  }),
  Details,
  DetailsSummary,
  DetailsContent,
  Youtube.configure({
    addPasteHandler: false,
    controls: true,
    nocookie: true,
  }),
  TiptapImage.configure({
    view: ImageView,
    allowBase64: false,
    resize: {
      enabled: true,
      directions: ["left", "right"],
      minWidth: 80,
      minHeight: 40,
      alwaysPreserveAspectRatio: true,
      //@ts-ignore
      createCustomHandle: createImageHandle,
      className: imageResizeClasses,
    },
  }),
  TiptapVideo.configure({
    view: VideoView,
    resize: {
      enabled: true,
      directions: ["left", "right"],
      minWidth: 80,
      minHeight: 40,
      alwaysPreserveAspectRatio: true,
      //@ts-ignore
      createCustomHandle: createResizeHandle,
      className: buildResizeClasses("node-video"),
    },
  }),
  Callout.configure({
    view: CalloutView,
  }),
  CustomCodeBlock.configure({
    view: CodeBlockView,
    //@ts-ignore
    lowlight,
    HTMLAttributes: {
      spellcheck: false,
    },
  }),
  Selection,
  Attachment.configure({
    view: AttachmentView,
  }),
  Embed.configure({
    view: EmbedView,
  }),
  Status.configure({
    view: StatusView,
  }),
  MarkdownClipboard.configure({
    transformPastedText: true,
  }),
  SearchAndReplace.extend({
    addKeyboardShortcuts() {
      return {
        "Mod-f": () => {
          const event = new CustomEvent("openFindDialogFromEditor", {});
          document.dispatchEvent(event);
          return true;
        },
        Escape: () => {
          const event = new CustomEvent("closeFindDialogFromEditor", {});
          document.dispatchEvent(event);
          return false;
        },
      };
    },
  }).configure(),
  Columns,
  Column,
  Markdown.configure({
    markedOptions: { gfm: true },
  }),
] as any;
