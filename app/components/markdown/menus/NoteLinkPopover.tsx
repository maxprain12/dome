import { useEffect, useId, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const LINK_PATTERN = /^(https?:\/\/|mailto:|dome:\/\/)[^\s]+$/i;

export default function NoteLinkPopover({ editor, open, onOpenChange }: { editor: Editor; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const linkId = useId();
  const [href, setHref] = useState('');
  const valid = LINK_PATTERN.test(href.trim());
  const active = editor.isActive('link');

  useEffect(() => {
    if (!open) return;
    setHref(String(editor.getAttributes('link').href || ''));
  }, [editor, open]);

  const apply = () => {
    const next = href.trim();
    if (!LINK_PATTERN.test(next)) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: next, marks: [{ type: 'link', attrs: { href: next } }] }).run();
    } else {
      chain.setLink({ href: next }).run();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notes.editor_link')}</DialogTitle>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={linkId}>{t('notes.editor_link_url')}</FieldLabel>
          <Input
            id={linkId}
            value={href}
            placeholder={t('notes.link_placeholder_url')}
            onChange={(event) => setHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                apply();
              }
            }}
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={!active} onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onOpenChange(false); }}>{t('common.delete')}</Button>
          <Button type="button" disabled={!valid} onClick={apply}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
