import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { attachPluginImage, fileToBase64, PLUGIN_IMAGE_MIME, pluginSiteImageMap, type PluginSiteImage } from '@/lib/plugins/media';
import { requestPlugin } from '@/lib/plugins/request';
import type { PluginHostContext } from '@/types/plugin';
import { cn } from '@/lib/utils';
import { needsSourceEditor, noteExtensions } from './note-extensions';
import NoteEditorToolbar from './NoteEditorToolbar';
import './markdown-note-editor.css';

export interface MarkdownNoteEditorHandle {
  getMarkdown: () => string;
  /** Load a stored revision without marking the document dirty. */
  setMarkdown: (markdown: string) => void;
}

interface MarkdownNoteEditorProps {
  initialMarkdown: string;
  readOnly?: boolean;
  placeholder?: string;
  pluginId?: string | null;
  resourceId?: string;
  siteImageMap?: Map<string, string>;
  className?: string;
  id?: string;
  onChange?: () => void;
  onReady?: () => void;
}

const MarkdownNoteEditor = forwardRef<MarkdownNoteEditorHandle, MarkdownNoteEditorProps>(
  function MarkdownNoteEditor(props, ref) {
    const { t } = useTranslation();
    const imageRefreshers = useRef(new Set<() => void>());
    const mediaContext = useRef<{ images?: Map<string, string>; siteUrl?: string }>({});
    const latest = useRef(props);
    latest.current = props;
    // Keep the original bytes until a user edit; opening or saving a title must not rewrite the body.
    const markdown = useRef(props.initialMarkdown);
    const visualChanged = useRef(false);
    const uploadPending = useRef(false);
    const [source, setSource] = useState(props.initialMarkdown);
    const [sourceMode, setSourceMode] = useState(() => needsSourceEditor(props.initialMarkdown));
    const [error, setError] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const alive = useRef(true);
    const forceSource = needsSourceEditor(source);
    const sourceModeRef = useRef(sourceMode);
    sourceModeRef.current = sourceMode;

    const editor = useEditor({
      extensions: noteExtensions(
        () => latest.current.placeholder || '',
        () => latest.current.siteImageMap ?? mediaContext.current.images,
        () => mediaContext.current.siteUrl,
        imageRefreshers.current,
      ),
      content: sourceMode ? '' : props.initialMarkdown,
      contentType: 'markdown',
      editable: !props.readOnly,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('notes.editor_body'), ...(props.id ? { id: props.id } : {}) },
        handlePaste: (_view, event) => {
          const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
          if (!files.length || latest.current.readOnly) return false;
          event.preventDefault();
          void uploadImages(files);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'));
          if (!files.length || latest.current.readOnly) return false;
          event.preventDefault();
          void uploadImages(files);
          return true;
        },
      },
      onUpdate: () => {
        visualChanged.current = true;
        latest.current.onChange?.();
      },
    });

    useEffect(() => {
      let cancelled = false;
      mediaContext.current = {};
      const refresh = () => imageRefreshers.current.forEach((render) => render());
      refresh();
      if (props.pluginId) {
        void Promise.all([
          requestPlugin<PluginSiteImage[]>(props.pluginId, 'media.list'),
          requestPlugin<PluginHostContext>(props.pluginId, 'host.context'),
        ]).then(([images, context]) => {
          if (cancelled) return;
          mediaContext.current = { images: pluginSiteImageMap(images), siteUrl: context.destination?.siteUrl };
          refresh();
        }).catch(() => { /* Existing references and alt text remain available. */ });
      }
      return () => { cancelled = true; };
    }, [props.pluginId]);

    useEffect(() => {
      imageRefreshers.current.forEach((render) => render());
    }, [props.siteImageMap]);

    const readMarkdown = () => {
      if (visualChanged.current && editor) {
        markdown.current = editor.getMarkdown();
        visualChanged.current = false;
      }
      return markdown.current;
    };

    const changeSource = (value: string) => {
      visualChanged.current = false;
      markdown.current = value;
      setSource(value);
      latest.current.onChange?.();
    };

    const insertImage = (src: string, alt: string) => {
      if (latest.current.readOnly) return;
      if (sourceModeRef.current) {
        const safeAlt = alt.replace(/[\\[\]]/g, '\\$&');
        changeSource(`${markdown.current.trimEnd()}\n\n![${safeAlt}](${src})\n`);
      } else {
        editor?.chain().focus().setImage({ src, alt }).run();
      }
    };

    async function uploadImages(files: File[]) {
      if (uploadPending.current) return;
      uploadPending.current = true;
      setUploading(true);
      setError(false);
      try {
        const { pluginId, resourceId } = latest.current;
        for (const file of files) {
          if (!PLUGIN_IMAGE_MIME[file.type]) throw new Error('Unsupported image');
          const src = pluginId && resourceId
            ? await attachPluginImage(pluginId, resourceId, file)
            : `data:${file.type};base64,${await fileToBase64(file)}`;
          if (!alive.current) return;
          insertImage(src, file.name.replace(/\.[^.]+$/, ''));
        }
      } catch {
        if (alive.current) setError(true);
      } finally {
        uploadPending.current = false;
        if (alive.current) setUploading(false);
      }
    }

    useImperativeHandle(ref, () => ({
      getMarkdown: readMarkdown,
      setMarkdown: (value) => {
        visualChanged.current = false;
        markdown.current = value;
        setSource(value);
        const requiresSource = needsSourceEditor(value);
        setSourceMode(requiresSource || sourceModeRef.current);
        editor?.commands.setContent(requiresSource ? '' : value, { contentType: 'markdown', emitUpdate: false });
      },
    }));

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!props.readOnly, false);
    }, [editor, props.readOnly]);

    useEffect(() => {
      alive.current = true;
      if (editor) latest.current.onReady?.();
      return () => { alive.current = false; };
    }, [editor]);

    return (
      <div className={cn('markdown-note-editor-host', props.className)}>
        {!props.readOnly ? (
          <div className="note-editor-toolbar">
            {!sourceMode && editor ? <NoteEditorToolbar editor={editor} /> : <span className="text-xs text-muted-foreground">{t('notes.editor_source')}</span>}
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? t('plugins.inserting_image') : t('plugins.insert_image')}</Button>
              <Button type="button" variant="ghost" size="sm" disabled={forceSource && sourceMode} aria-pressed={sourceMode} onClick={() => {
                if (sourceMode) editor?.commands.setContent(markdown.current, { contentType: 'markdown', emitUpdate: false });
                else setSource(readMarkdown());
                setSourceMode(!sourceMode);
              }}>{sourceMode ? t('notes.editor_visual') : t('notes.editor_source')}</Button>
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={t('notes.slash_item_image')} onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = '';
              void uploadImages(files);
            }} />
          </div>
        ) : null}
        {sourceMode ? (
          <>
            {forceSource ? <p className="px-3 py-2 text-xs text-muted-foreground">{t('notes.editor_source_hint')}</p> : null}
            <Textarea id={props.id} className="note-editor-source" aria-label={t('notes.editor_body')} value={source} readOnly={props.readOnly} placeholder={props.placeholder} onChange={(event) => changeSource(event.target.value)} />
          </>
        ) : <EditorContent editor={editor} />}
        {error ? <Alert variant="destructive"><AlertDescription>{t('plugins.image_error')}</AlertDescription></Alert> : null}
      </div>
    );
  },
);

export default MarkdownNoteEditor;
