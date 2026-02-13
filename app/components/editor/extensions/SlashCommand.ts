import { Extension } from '@tiptap/core';
import { createSlashCommandPlugin } from './SlashCommandPlugin';
import type { ReactNode } from 'react';

export interface SlashCommandItem {
  title: string;
  description?: string;
  icon?: ReactNode;
  category: string;
  command: (props: { editor: any; range: { from: number; to: number } }) => void;
  keywords?: string[];
}

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  priority: 1000,

  addOptions() {
    return {
      commands: [] as SlashCommandItem[],
    };
  },

  addProseMirrorPlugins() {
    return [createSlashCommandPlugin(this.options.commands, this.editor)];
  },
});
