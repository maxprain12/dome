import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { attachPluginImage, fileToBase64, PLUGIN_IMAGE_MIME, pluginSiteImageMap, type PluginSiteImage } from '@/lib/plugins/media';
import { requestPlugin } from '@/lib/plugins/request';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { countWordsFromMarkdown } from '@/lib/notes/loadNoteMarkdown';
import type { PluginHostContext } from '@/types/plugin';
import { cn } from '@/lib/utils';
import { needsSourceEditor, noteExtensions, type NoteEditorProfile, type NoteOutlineItem } from './extensions';
import type { EditorRange, MathEditRequest } from './extensions/types';
import NoteBlockHandle from './menus/NoteBlockHandle';
import NoteBubbleMenu from './menus/NoteBubbleMenu';
import { NoteMathDialog, NoteYoutubeDialog } from './menus/NoteInsertDialogs';
import NoteTableMenu from './menus/NoteTableMenu';
import 'katex/dist/katex.min.css';
import './markdown-note-editor.css';

export interface MarkdownNoteEditorHandle {
  getMarkdown: () => string;
  /** Load a stored revision without marking the document dirty. */
  setMarkdown: (markdown: string) => void;
  setSourceMode: (source: boolean) => void;
  getStats: () => { words: number; characters: number };
  scrollTo: (pos: number) => void;
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
  profile?: NoteEditorProfile;
  onChange?: () => void;
  onReady?: () => void;
  onSourceModeChange?: (source: boolean, locked: boolean) => void;
  onOutlineChange?: (items: NoteOutlineItem[]) => void;
}

const MarkdownNoteEditor = forwardRef<MarkdownNoteEditorHandle, MarkdownNoteEditorProps>(
  function MarkdownNoteEditor(props, ref) {
    const { t } = useTranslation();
    const profile = props.profile ?? 'note';
    const imageRefreshers = useRef(new Set<() => void>());
    const mediaContext = useRef<{ images?: Map<string, string>; siteUrl?: string }>({});
    const latest = useRef(props);
    latest.current = props;
    const markdown = useRef(props.initialMarkdown);
    const visualChanged = useRef(false);
    const uploadPending = useRef(false);
    const suspend = useRef(true);
    const editorRef = useRef<Editor | null>(null);
    const [source, setSource] = useState(props.initialMarkdown);
    const [sourceMode, setSourceModeState] = useState(() => needsSourceEditor(props.initialMarkdown));
    const [error, setError] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [mathRequest, setMathRequest] = useState<MathEditRequest | null>(null);
    const [youtubeRange, setYoutubeRange] = useState<EditorRange | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const alive = useRef(true);
    const forceSource = needsSourceEditor(source);
    const sourceModeRef = useRef(sourceMode);
    sourceModeRef.current = sourceMode;

    const holdUpdates = () => {
      suspend.current = true;
      queueMicrotask(() => { suspend.current = false; });
    };

    const editor = useEditor({
      extensions: noteExtensions(profile, {
        placeholder: () => latest.current.placeholder ?? t('notes.editor_placeholder'),
        siteImages: () => latest.current.siteImageMap ?? mediaContext.current.images,
        siteUrl: () => mediaContext.current.siteUrl,
        refreshers: imageRefreshers.current,
        uploadImages: (files, pos) => { uploadImages(files, pos).catch(() => {}); },
        openMath: (request) => setMathRequest(request),
        onOutline: (items) => latest.current.onOutlineChange?.(items),
        pickImage: () => fileRef.current?.click(),
        insertYoutube: (range) => setYoutubeRange(range),
        askAi: (current, range) => {
          current.chain().focus().deleteRange(range).run();
          const { $from } = current.state.selection;
          if ($from.start() < $from.end()) current.commands.setTextSelection({ from: $from.start(), to: $from.end() });
        },
      }),
      content: sourceMode ? '' : props.initialMarkdown,
      contentType: 'markdown',
      editable: !props.readOnly,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('notes.editor_body'), ...(props.id ? { id: props.id } : {}) },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
            event.preventDefault();
            setLinkOpen(true);
            return true;
          }
          return false;
        },
        handleClick: (_view, _pos, event) => {
          if (!(event.metaKey || event.ctrlKey)) return false;
          const href = editorRef.current?.getAttributes('link').href;
          if (typeof href !== 'string' || !href) return false;
          event.preventDefault();
          openDomeHref(href).catch(() => {});
          return true;
        },
      },
      onCreate: () => holdUpdates(),
      onUpdate: () => {
        if (suspend.current) return;
        visualChanged.current = true;
        latest.current.onChange?.();
      },
    });
    editorRef.current = editor;

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

    useEffect(() => {
      latest.current.onSourceModeChange?.(sourceMode, forceSource);
    }, [sourceMode, forceSource]);

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

    const applySourceMode = (next: boolean) => {
      const locked = needsSourceEditor(markdown.current);
      if (!next && locked) return;
      if (next === sourceModeRef.current) return;
      if (next) setSource(readMarkdown());
      else {
        holdUpdates();
        editor?.commands.setContent(markdown.current, { contentType: 'markdown', emitUpdate: false });
      }
      setSourceModeState(next);
    };

    const insertImage = (src: string, alt: string, pos?: number) => {
      if (latest.current.readOnly) return;
      if (sourceModeRef.current) {
        const safeAlt = alt.replace(/[\\[\]]/g, '\\$&');
        changeSource(`${markdown.current.trimEnd()}\n\n![${safeAlt}](${src})\n`);
        return;
      }
      const chain = editor?.chain().focus();
      if (!chain) return;
      const node = { type: 'image', attrs: { src, alt } };
      if (pos == null) chain.setImage({ src, alt }).run();
      else chain.insertContentAt(pos, node).run();
    };

    async function uploadImages(files: File[], pos?: number) {
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
          insertImage(src, file.name.replace(/\.[^.]+$/, ''), pos);
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
        holdUpdates();
        visualChanged.current = false;
        markdown.current = value;
        setSource(value);
        const requiresSource = needsSourceEditor(value);
        setSourceModeState(requiresSource || sourceModeRef.current);
        editor?.commands.setContent(requiresSource ? '' : value, { contentType: 'markdown', emitUpdate: false });
      },
      setSourceMode: applySourceMode,
      getStats: () => {
        if (sourceModeRef.current || !editor) {
          return { words: countWordsFromMarkdown(markdown.current), characters: markdown.current.length };
        }
        return {
          words: editor.storage.characterCount.words(),
          characters: editor.storage.characterCount.characters(),
        };
      },
      scrollTo: (pos) => { editor?.chain().focus().setTextSelection(pos + 1).scrollIntoView().run(); },
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

    const showChrome = Boolean(editor) && !props.readOnly && !sourceMode;
    const showAi = typeof window !== 'undefined' && typeof window.electron?.invoke === 'function';

    return (
      <div className={cn('markdown-note-editor-host', props.className)}>
        {sourceMode ? (
          <>
            {forceSource ? <p className="px-3 py-2 text-xs text-muted-foreground">{t('notes.editor_source_hint')}</p> : null}
            <Textarea id={props.id} className="note-editor-source" aria-label={t('notes.editor_body')} value={source} readOnly={props.readOnly} placeholder={props.placeholder} onChange={(event) => changeSource(event.target.value)} />
          </>
        ) : <EditorContent editor={editor} />}
        {showChrome && editor ? (
          <>
            <NoteBubbleMenu editor={editor} linkOpen={linkOpen} onLinkOpen={setLinkOpen} showAi={showAi} />
            <NoteTableMenu editor={editor} />
            {profile === 'embedded' ? null : <NoteBlockHandle editor={editor} />}
            <NoteMathDialog editor={editor} request={mathRequest} onClose={() => setMathRequest(null)} />
            <NoteYoutubeDialog editor={editor} range={youtubeRange} onClose={() => setYoutubeRange(null)} />
          </>
        ) : null}
        {uploading ? <p role="status" className="text-xs text-muted-foreground">{t('plugins.inserting_image')}</p> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{t('plugins.image_error')}</AlertDescription></Alert> : null}
        {!props.readOnly ? (
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label={t('notes.slash_item_image')} onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            uploadImages(files).catch(() => {});
          }} />
        ) : null}
      </div>
    );
  },
);

export default MarkdownNoteEditor;
