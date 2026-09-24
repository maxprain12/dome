import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export default function NoteTableMenu({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const actions = [
    { key: 'editor_add_row', run: () => editor.chain().focus().addRowAfter().run() },
    { key: 'editor_add_column', run: () => editor.chain().focus().addColumnAfter().run() },
    { key: 'editor_delete_row', run: () => editor.chain().focus().deleteRow().run() },
    { key: 'editor_delete_column', run: () => editor.chain().focus().deleteColumn().run() },
    { key: 'editor_delete_table', run: () => editor.chain().focus().deleteTable().run() },
  ] as const;
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="noteTableMenu"
      updateDelay={40}
      options={{ placement: 'bottom', offset: 8 }}
      shouldShow={({ editor: current }) => current.isActive('table')}
    >
      <div className="flex items-center gap-0.5 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10" role="toolbar" aria-label={t('notes.slash_item_table')}>
        {actions.map((action) => (
          <Button key={action.key} type="button" variant="ghost" size="sm" className={action.key === 'editor_delete_table' ? 'text-destructive' : undefined} onClick={action.run}>
            {t(`notes.${action.key}`)}
          </Button>
        ))}
      </div>
    </BubbleMenu>
  );
}
