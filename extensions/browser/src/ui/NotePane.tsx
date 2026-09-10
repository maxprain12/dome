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
        <select
          aria-label={t('note')}
          value={props.note?.id || ''}
          disabled={props.busy || props.dirty}
          onChange={(event) => props.onSelect(event.target.value)}
        >
          <option value="">{t('newNote')}</option>
          {props.notes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <input
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
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onSave(true)}
            >
              {t('saveCopy')}
            </button>
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onRemote}
            >
              {t('loadRemote')}
            </button>
          </div>
        </div>
      )}
      <div className="dome-row">
        <button
          type="button"
          className="primary"
          disabled={props.busy || !props.title.trim() || !!props.conflict}
          onClick={() => props.onSave()}
        >
          <Icon name="check" />
          {t(props.busy ? 'working' : 'saveNote')}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={props.busy || !props.selection}
          title={t('selectionHint')}
          onClick={props.onQuote}
        >
          <Icon name="plus" />
          {t('addSelection')}
        </button>
      </div>
      {props.dirty && <p className="helper">{t('unsavedHint')}</p>}
    </div>
  );
}
