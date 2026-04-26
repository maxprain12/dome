import type { CommandProps } from '@tiptap/core';
import { Node, mergeAttributes, ReactNodeViewRenderer } from '@tiptap/react';
import { AIBlockNodeView } from '@/components/editor/AIBlockNodeView';

export type AIBlockStatus = 'idle' | 'running' | 'done' | 'error';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiBlock: {
      setAIBlock: (attributes?: { prompt?: string; response?: string; status?: AIBlockStatus }) => ReturnType;
    };
  }
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const AIBlock = Node.create({
  name: 'aiBlock',

  group: 'block',

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      prompt: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-prompt') ?? '',
        renderHTML: (attrs) => ({ 'data-prompt': safeText(attrs.prompt) }),
      },
      response: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-response') ?? '',
        renderHTML: (attrs) => ({ 'data-response': safeText(attrs.response) }),
      },
      status: {
        default: 'idle',
        parseHTML: (el) => el.getAttribute('data-status') ?? 'idle',
        renderHTML: (attrs) => ({ 'data-status': safeText(attrs.status) || 'idle' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-type="ai-block"]' }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AIBlockNodeView);
  },

  renderHTML({ HTMLAttributes, node }) {
    const prompt = safeText(node.attrs.prompt);
    const response = safeText(node.attrs.response);
    const status = safeText(node.attrs.status) || 'idle';

    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'ai-block',
        class: 'dome-ai-block',
      }),
      ['div', { class: 'dome-ai-block__eyebrow' }, 'AI'],
      ['p', { class: 'dome-ai-block__prompt' }, prompt || 'Describe lo que quieres generar...'],
      response
        ? ['div', { class: 'dome-ai-block__response' }, response]
        : ['div', { class: 'dome-ai-block__empty' }, status === 'running' ? 'Generando...' : 'Pulsa generar para crear contenido.'],
      ['div', { class: 'dome-ai-block__actions' },
        ['button', { class: 'dome-ai-block-generate', type: 'button' }, status === 'running' ? 'Generando' : 'Generar'],
        ['button', { class: 'dome-ai-block-insert', type: 'button' }, 'Insertar'],
        ['button', { class: 'dome-ai-block-replace', type: 'button' }, 'Reemplazar'],
      ],
    ];
  },

  addCommands() {
    return {
      setAIBlock:
        (attributes = {}) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              prompt: attributes.prompt ?? '',
              response: attributes.response ?? '',
              status: attributes.status ?? 'idle',
            },
          }),
    };
  },
});
