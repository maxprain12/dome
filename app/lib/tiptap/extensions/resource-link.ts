import { InputRule, Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';
import type { ResourceType } from '@/types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resourceLink: {
      insertResourceLink: (attrs: {
        resourceId: string;
        title: string;
        resourceType: ResourceType | string;
      }) => ReturnType;
    };
  }
}

export const ResourceLink = Node.create({
  name: 'resourceLink',

  group: 'inline',

  inline: true,

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      resourceId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-resource-id') ?? '',
        renderHTML: (attrs) => ({ 'data-resource-id': attrs.resourceId }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
      resourceType: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-resource-type') ?? 'note',
        renderHTML: (attrs) => ({ 'data-resource-type': attrs.resourceType }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-resource-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-resource-link': 'true',
        class: 'dome-resource-link',
        'data-resource-id': node.attrs.resourceId,
        'data-title': node.attrs.title,
        'data-resource-type': node.attrs.resourceType,
        role: 'button',
        tabindex: 0,
      }),
      node.attrs.title || 'Recurso',
    ];
  },

  addCommands() {
    return {
      insertResourceLink:
        (attrs: { resourceId: string; title: string; resourceType: ResourceType | string }) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              resourceId: attrs.resourceId,
              title: attrs.title,
              resourceType: attrs.resourceType,
            },
          }),
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[$/,
        handler: ({ range, chain }) => {
          const bridge = this.editor.storage.noteEditorBridge;
          if (!bridge?.openResourcePicker) return null;
          chain().deleteRange({ from: range.from, to: range.to }).focus().run();
          bridge.openResourcePicker('link');
          return null;
        },
      }),
    ];
  },
});
