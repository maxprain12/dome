import { cva } from 'class-variance-authority';

export const buttonGroupVariants = cva('tiptap-button-group', {
  variants: {
    orientation: {
      horizontal: 'tiptap-button-group-horizontal',
      vertical: 'tiptap-button-group-vertical',
    },
  },
  defaultVariants: {
    orientation: 'horizontal',
  },
});
