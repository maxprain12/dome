import { Button } from '../../../../app/components/ui/button';
import { Input } from '../../../../app/components/ui/input';
import DesktopSelect from './DesktopSelect';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownNoteEditor from '../../../../app/components/markdown/MarkdownNoteEditor';
import type { MarkdownNoteEditorHandle } from '../../../../app/components/markdown/MarkdownNoteEditor';
import type { NoteSummary } from '../lib/protocol';
import type { NoteDetail } from '../lib/client';
import { Icon } from './Icon';

interface Props {
  editorRef: RefObject<MarkdownNoteEditorHandle>;
  notes: NoteSummary[];
  note: NoteDetail | null;
  markdown: string;
  title: string;
  revision: number;
  dirty: boolean;
  busy: boolean;
  selection: string;
  conflict: NoteDetail | null;
  onSelect: (id: string) => void;
  onChange: (markdown: string) => void;
  onEdit: () => void;
  onTitle: (title: string) => void;
  onSave: (copy?: boolean) => void;
  onRemote: () => void;
  onQuote: () => void;
}
export default function NotePane(props: Props) {
  const { t } = useTranslation();
  const editor = props.editorRef;
  return (
    <div className="note-pane">
      <label className="field">
        {t('note')}
        <DesktopSelect
          label={t('note')}
          value={props.note?.id || ''}
          disabled={props.busy || props.dirty}
          onChange={props.onSelect}
          items={[
            { value: '', label: t('newNote') },
            ...props.notes.map((item) => ({
              value: item.id,
              label: item.title,
            })),
          ]}
        />
      </label>
      <Input
        className="note-title"
        aria-label={t('noteTitle')}
        value={props.title}
        maxLength={200}
        disabled={props.busy}
        onChange={(event) => props.onTitle(event.target.value)}
        placeholder={t('noteTitle')}
      />
      <div
        className="note-editor note-area"
        onInputCapture={props.onEdit}
        aria-label={t('note')}
      >
        <MarkdownNoteEditor
          key={`${props.note?.id || 'new'}:${props.revision}`}
          ref={editor}
          initialMarkdown={props.markdown}
          readOnly={props.busy}
          placeholder={t('notePlaceholder')}
          onChange={() => {
            if (editor.current) props.onChange(editor.current.getMarkdown());
          }}
        />
      </div>
      <p className="editor-caption">
        {props.dirty ? t('dirty') : t('editorHint')}
      </p>
      {props.conflict && (
        <div className="conflict" role="alert">
          <p>{t('conflict')}</p>
          <div className="dome-row">
            <Button
              type="button"
              disabled={props.busy}
              onClick={() => props.onSave(true)}
            >
              {t('saveCopy')}
            </Button>
            <Button
              type="button"
              disabled={props.busy}
              onClick={props.onRemote}
            >
              {t('loadRemote')}
            </Button>
          </div>
        </div>
      )}
      <div className="dome-row">
        <Button
          type="button"
          disabled={props.busy || !props.title.trim() || !!props.conflict}
          onClick={() => props.onSave()}
        >
          <Icon name="check" data-icon="inline-start" />
          {t(props.busy ? 'working' : 'saveNote')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={props.busy || !props.selection}
          title={t('selectionHint')}
          onClick={props.onQuote}
        >
          <Icon name="plus" data-icon="inline-start" />
          {t('addSelection')}
        </Button>
      </div>
      {props.dirty && <p className="helper">{t('unsavedHint')}</p>}
    </div>
  );
}
