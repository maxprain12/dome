import { useEditor } from "@tiptap/react";

type Range = { from: number; to: number };

export type EmojiMartFrequentlyType = Record<string, number>;

export type CommandProps = {
  editor: ReturnType<typeof useEditor>;
  range: Range;
};

export type EmojiMenuItemType = {
  id: string;
  emoji: string;
  count?: number;
  command: (props: CommandProps) => void;
};
