import { useEffect, useId, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { isValidYoutubeUrl } from '../extensions/youtube-embed';
import type { EditorRange, MathEditRequest } from '../extensions/types';

export function NoteMathDialog({ editor, request, onClose }: { editor: Editor; request: MathEditRequest | null; onClose: () => void }) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [latex, setLatex] = useState('');
  useEffect(() => { setLatex(request?.latex ?? ''); }, [request]);
  const apply = () => {
    if (!request) return;
    const next = latex.trim();
    if (!next) return;
    const chain = editor.chain().focus();
    if (request.range) chain.deleteRange(request.range);
    if (request.create) chain.insertBlockMath({ latex: next });
    else if (request.kind === 'inline') chain.updateInlineMath({ latex: next, pos: request.pos });
    else chain.updateBlockMath({ latex: next, pos: request.pos });
    chain.run();
    onClose();
  };
  return (
    <Dialog open={request !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('notes.math_title')}</DialogTitle></DialogHeader>
        <Field>
          <FieldLabel htmlFor={fieldId}>{t('notes.math_latex')}</FieldLabel>
          <Input id={fieldId} value={latex} onChange={(event) => setLatex(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" disabled={!latex.trim()} onClick={apply}>{t('notes.math_apply')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NoteYoutubeDialog({ editor, range, onClose }: { editor: Editor; range: EditorRange | null; onClose: () => void }) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [url, setUrl] = useState('');
  useEffect(() => { if (range) setUrl(''); }, [range]);
  const valid = Boolean(isValidYoutubeUrl(url.trim()));
  const apply = () => {
    if (!range || !valid) return;
    editor.chain().focus().deleteRange(range).setYoutubeVideo({ src: url.trim() }).run();
    onClose();
  };
  return (
    <Dialog open={range !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t('notes.youtube_title')}</DialogTitle></DialogHeader>
        <Field>
          <FieldLabel htmlFor={fieldId}>{t('notes.youtube_url')}</FieldLabel>
          <Input id={fieldId} value={url} placeholder="https://www.youtube.com/watch?v=" onChange={(event) => setUrl(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" disabled={!valid} onClick={apply}>{t('notes.youtube_insert')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
