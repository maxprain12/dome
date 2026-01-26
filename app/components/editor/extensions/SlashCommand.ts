import { Extension } from '@tiptap/core';
import { createSlashCommandPlugin, SlashCommandItem } from './SlashCommandPlugin';

export interface SlashCommandItem {
  title: string;
  description?: string;
  icon?: string;
  category: string;
  command: (props: { editor: any; range: { from: number; to: number } }) => void;
  keywords?: string[];
}

export const SlashCommandExtension = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      commands: [] as SlashCommandItem[],
    };
  },

  addProseMirrorPlugins() {
    return [createSlashCommandPlugin(this.options.commands)];
  },
});
