import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { SparklesIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { chat } from '@/lib/ai/client';
import { getEditorActionPrompt } from '@/lib/prompts/loader';

type Action = 'improve' | 'summarize' | 'translate';
const languageNames = { en: 'English', es: 'Spanish', fr: 'French', pt: 'Portuguese' } as const;
type TargetLanguage = keyof typeof languageNames;

export default function NoteAiActions({ editor, compact = false }: { editor: Editor; compact?: boolean }) {
  const { t } = useTranslation();
  const [action, setAction] = useState<Action | null>(null);
  const [targetLanguage, setTargetLanguage] = useState<TargetLanguage | null>(null);
  const [original, setOriginal] = useState('');
  const [result, setResult] = useState('');
  const [range, setRange] = useState<{ from: number; to: number; doc: typeof editor.state.doc } | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { selection } = current.state;
      return !selection.empty && selection.$from.sameParent(selection.$to)
        && selection.$from.parent.isTextblock && selection.$from.parent.type.name !== 'codeBlock';
    },
  });

  const run = async (nextAction: Action, target: TargetLanguage | null = null) => {
    const { selection, doc } = editor.state;
    if (selection.empty || !selection.$from.sameParent(selection.$to)
      || !selection.$from.parent.isTextblock || selection.$from.parent.type.name === 'codeBlock') return;
    const text = doc.textBetween(selection.from, selection.to);
    if (!text.trim()) return;
    setAction(nextAction);
    setTargetLanguage(target);
    setOriginal(text);
    setResult('');
    setRange({ from: selection.from, to: selection.to, doc });
    setWorking(true);
    setError(null);
    try {
      const response = await chat([
        { role: 'system', content: `${getEditorActionPrompt(nextAction)}\nWork only on the selected text. Return plain replacement text without Markdown fences or commentary.` },
        { role: 'user', content: target ? `Target language: ${languageNames[target]}\n\nSelected text:\n${text}` : text },
      ]);
      if (!response.trim()) throw new Error('Empty response');
      setResult(response.trim());
    } catch {
      setError(t('notes.editor_ai_error'));
    } finally {
      setWorking(false);
    }
  };

  const apply = () => {
    if (!range || !result.trim()) return;
    if (!editor.state.doc.eq(range.doc)) {
      setError(t('notes.editor_ai_changed'));
      return;
    }
    editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, result.trim()).run();
    setAction(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size={compact ? 'icon-sm' : 'sm'} disabled={!selected} aria-label={t('notes.editor_ai')} />}>
          {compact ? <HugeiconsIcon icon={SparklesIcon} /> : t('notes.editor_ai')}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuGroup>
            {(['improve', 'summarize'] as const).map((item) => (
              <DropdownMenuItem key={item} onClick={() => { run(item).catch(() => {}); }}>{t(`notes.editor_ai_${item}`)}</DropdownMenuItem>
            ))}
            {(Object.keys(languageNames) as TargetLanguage[]).map((language) => (
              <DropdownMenuItem key={language} onClick={() => { run('translate', language).catch(() => {}); }}>{t(`notes.editor_ai_translate_${language}`)}</DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) setAction(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{action === 'translate' && targetLanguage ? t(`notes.editor_ai_translate_${targetLanguage}`) : action ? t(`notes.editor_ai_${action}`) : t('notes.editor_ai')}</DialogTitle>
            <DialogDescription>{t('notes.editor_ai_preview')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">{original}</div>
            <Textarea aria-label={t('notes.editor_ai_result')} value={result} onChange={(event) => setResult(event.target.value)} rows={7} disabled={working} />
            {working ? <p role="status" className="text-sm text-muted-foreground">{t('notes.editor_ai_working')}</p> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="button" onClick={apply} disabled={working || !result.trim()}>{t('notes.editor_ai_apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
