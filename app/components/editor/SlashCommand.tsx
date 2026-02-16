import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import { SlashCommandPluginKey } from './extensions/SlashCommandPlugin';
import type { SlashCommandState } from './extensions/SlashCommandPlugin';
import type { SlashCommandItem } from './extensions/SlashCommand';
import { showPrompt } from '@/lib/store/usePromptStore';
import { useAppStore } from '@/lib/store/useAppStore';
import { markdownToHtml } from '@/lib/utils/markdown';
import {
  FileText,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Image,
  Video,
  Music,
  Paperclip,
  Table,
  Lightbulb,
  ChevronRight,
  Minus,
  Code,
  AtSign,
  Link,
  Sparkles,
  BookOpen,
  PenLine,
  Languages,
  Workflow,
} from 'lucide-react';

interface SlashCommandMenuProps {
  editor: Editor;
}

const PORTAL_ID = 'dome-slash-command-portal';

function getPortalContainer(): HTMLDivElement {
  let el = document.getElementById(PORTAL_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = PORTAL_ID;
    document.body.appendChild(el);
  }
  return el;
}

export const SlashCommandMenu = React.memo(function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  const [state, setState] = useState<SlashCommandState>({
    show: false,
    items: [],
    selectedIndex: 0,
    query: '',
    range: null,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const pluginState = SlashCommandPluginKey.getState(editor.state) as SlashCommandState;
      if (pluginState) {
        setState(pluginState);
      }
    };

    editor.on('update', update);
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);

    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  useEffect(() => {
    if (menuRef.current && state.show && state.selectedIndex >= 0) {
      const selectedElement = menuRef.current.querySelector(`[data-index="${state.selectedIndex}"]`) as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [state.selectedIndex, state.show]);

  if (!state.show) {
    if (typeof document !== 'undefined') {
      return createPortal(null, getPortalContainer());
    }
    return null;
  }

  if (typeof document === 'undefined') return null;

  const hasResults = state.items.length > 0;

  const groupedItems = hasResults
    ? state.items.reduce((acc, item) => {
      const category = item.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category]!.push(item);
      return acc;
    }, {} as Record<string, SlashCommandItem[]>)
    : {};

  // Calculate position - ensure menu stays in viewport
  const { from } = editor.state.selection;
  const coords = editor.view.coordsAtPos(from);
  const menuWidth = 320;
  const menuMaxHeight = 360;
  const padding = 12;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${Math.max(padding, Math.min(coords.left, typeof window !== 'undefined' ? window.innerWidth - menuWidth - padding : coords.left))}px`,
    top: `${coords.bottom + 8}px`,
    width: `${menuWidth}px`,
    maxHeight: `${Math.min(menuMaxHeight, typeof window !== 'undefined' ? window.innerHeight - coords.bottom - 24 : menuMaxHeight)}px`,
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex: 10001,
    padding: '6px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1.5px solid var(--border)',
    borderRadius: 'var(--radius-xl, 12px)',
    boxShadow: '0 12px 48px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    animation: 'dropdown-appear 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={menuStyle}
      role="listbox"
      aria-label="Comandos"
    >
      {state.query && (
        <div
          style={{
            padding: '6px 10px 8px',
            fontSize: '11px',
            color: 'var(--tertiary-text)',
            fontWeight: 500,
          }}
        >
          Search: &quot;{state.query}&quot;
        </div>
      )}
      {!hasResults ? (
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            fontSize: '13px',
            color: 'var(--secondary-text)',
          }}
        >
          No commands match &quot;{state.query || ''}&quot;
        </div>
      ) : (
        Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category}>
            <div
              style={{
                padding: '8px 10px 4px',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                color: 'var(--tertiary-text)',
                letterSpacing: '0.06em',
              }}
            >
              {category}
            </div>
            {categoryItems.map((item) => {
              const globalIndex = state.items.indexOf(item);
              const isSelected = globalIndex === state.selectedIndex;
              return (
                <div
                  key={`${item.title}-${item.category}`}
                  data-index={globalIndex}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onClick={() => {
                    if (state.range) {
                      item.command({
                        editor,
                        range: state.range,
                      });
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer rounded-lg transition-all duration-100 focus-visible:outline-none"
                  style={{
                    padding: '8px 10px',
                    backgroundColor: isSelected ? 'var(--translucent)' : 'transparent',
                    marginBottom: '1px',
                    borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                  onMouseEnter={() => {
                    const tr = editor.state.tr.setMeta('slashCommand', {
                      type: 'updateSelectedIndex',
                      index: globalIndex,
                    });
                    editor.view.dispatch(tr);
                  }}
                >
                  {item.icon && (
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{
                        color: isSelected ? 'var(--accent)' : 'var(--secondary-text)',
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-md, 6px)',
                        background: isSelected ? 'var(--translucent)' : 'var(--bg-tertiary)',
                        transition: 'all 0.1s ease',
                      }}
                    >
                      {item.icon}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: isSelected ? 'var(--accent)' : 'var(--primary-text)',
                      fontSize: '13px',
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}>
                      {item.title}
                    </div>
                    {item.description && (
                      <div style={{
                        color: 'var(--tertiary-text)',
                        fontSize: '11px',
                        marginTop: '1px',
                        lineHeight: 1.3,
                      }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );

  return createPortal(menuContent, getPortalContainer());
});

export function getSlashCommandItems(): SlashCommandItem[] {
  return [
    // Basic
    {
      title: 'Text',
      description: 'Start writing text',
      icon: <FileText size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setParagraph().run();
        }
      },
      keywords: ['texto', 'parrafo', 'p'],
    },
    {
      title: 'Heading 1',
      description: 'Large heading',
      icon: <Heading1 size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
        }
      },
      keywords: ['h1', 'titulo', 'heading'],
    },
    {
      title: 'Heading 2',
      description: 'Medium heading',
      icon: <Heading2 size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
        }
      },
      keywords: ['h2', 'subtitulo'],
    },
    {
      title: 'Heading 3',
      description: 'Small heading',
      icon: <Heading3 size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
        }
      },
      keywords: ['h3'],
    },
    {
      title: 'Bullet list',
      description: 'Create a bullet list',
      icon: <List size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        }
      },
      keywords: ['lista', 'bullet', 'viñetas'],
    },
    {
      title: 'Numbered list',
      description: 'Create a numbered list',
      icon: <ListOrdered size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        }
      },
      keywords: ['numerada', 'ordenada', 'numbered'],
    },
    {
      title: 'Task list',
      description: 'Create a task list',
      icon: <CheckSquare size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleTaskList().run();
        }
      },
      keywords: ['todo', 'tareas', 'checklist'],
    },
    {
      title: 'Quote',
      description: 'Create a quote',
      icon: <Quote size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        }
      },
      keywords: ['quote', 'cita', 'blockquote'],
    },
    {
      title: 'Bold',
      description: 'Apply bold formatting',
      icon: <Bold size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleBold().run();
        }
      },
      keywords: ['negrita', 'bold', 'b'],
    },
    {
      title: 'Italic',
      description: 'Apply italic formatting',
      icon: <Italic size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleItalic().run();
        }
      },
      keywords: ['cursiva', 'italic', 'i'],
    },
    {
      title: 'Underline',
      description: 'Apply underline formatting',
      icon: <Underline size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleUnderline().run();
        }
      },
      keywords: ['subrayado', 'underline', 'u'],
    },
    {
      title: 'Strikethrough',
      description: 'Apply strikethrough formatting',
      icon: <Strikethrough size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleStrike().run();
        }
      },
      keywords: ['tachado', 'strikethrough', 'strike', 's'],
    },
    {
      title: 'Inline code',
      description: 'Apply code formatting',
      icon: <Code size={18} />,
      category: 'Basic',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleCode().run();
        }
      },
      keywords: ['codigo', 'code', 'inline'],
    },
    // Media
    {
      title: 'Image',
      description: 'Insert an image',
      icon: <Image size={18} />,
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          const url = await showPrompt('Image URL:');
          if (url) {
            editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
          }
        }
      },
      keywords: ['imagen', 'image', 'img'],
    },
    {
      title: 'PDF',
      description: 'Embed a PDF',
      icon: <FileText size={18} />,
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          if (typeof window !== 'undefined' && window.electron?.selectFile && window.electron?.resource?.import) {
            try {
              const filePaths = await window.electron.selectFile({
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
              });

              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0]!;
                const filename = filePath.split(/[/\\]/).pop() || 'document.pdf';
                const projectId = useAppStore.getState().currentProject?.id || 'default';

                const result = await window.electron.resource.import(filePath, projectId, 'pdf', filename);

                const resourceId = result?.success && result.data
                  ? result.data.id
                  : result?.duplicate?.id;

                if (resourceId) {
                  editor.chain().focus().setPDFEmbed({
                    resourceId,
                    pageStart: 1,
                    zoom: 1.0,
                  }).run();
                }
              }
            } catch (error) {
              console.error('Error importing PDF:', error);
            }
          }
        }
      },
      keywords: ['pdf', 'documento'],
    },
    {
      title: 'Video',
      description: 'Embed a video',
      icon: <Video size={18} />,
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const url = await showPrompt('Video URL (YouTube, Vimeo, or file):');
          if (url) {
            const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
            if (youtubeMatch) {
              const videoId = youtubeMatch[1];
              editor.chain().focus().setVideoEmbed({
                src: `https://www.youtube.com/embed/${videoId}`,
                provider: 'youtube',
                videoId,
              }).run();
            } else {
              editor.chain().focus().setVideoEmbed({
                src: url,
                provider: 'direct',
              }).run();
            }
          }
        }
      },
      keywords: ['video', 'youtube'],
    },
    {
      title: 'Audio',
      description: 'Embed audio',
      icon: <Music size={18} />,
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const url = await showPrompt('Audio URL or select file:');
          if (url) {
            editor.chain().focus().setAudioEmbed({ src: url }).run();
          } else if (typeof window !== 'undefined' && window.electron?.selectFile) {
            try {
              const filePaths = await window.electron.selectFile({
                filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
              });

              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0]!;
                editor.chain().focus().setAudioEmbed({ src: filePath, isLocal: true }).run();
              }
            } catch (error) {
              console.error('Error selecting audio:', error);
            }
          }
        }
      },
      keywords: ['audio', 'music'],
    },
    {
      title: 'File',
      description: 'Insert a file',
      icon: <Paperclip size={18} />,
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          if (typeof window !== 'undefined' && window.electron?.selectFile) {
            try {
              const filePaths = await window.electron.selectFile();

              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0]!;
                const filename = filePath.split('/').pop() || 'file';

                editor.chain().focus().insertContent({
                  type: 'fileBlock',
                  attrs: {
                    resourceId: '',
                    filename: filename,
                    filePath: filePath,
                  },
                }).run();
              }
            } catch (error) {
              console.error('Error selecting file:', error);
            }
          }
        }
      },
      keywords: ['archivo', 'file', 'adjunto'],
    },
    // Avanzado
    {
      title: 'Table',
      description: 'Insert a table',
      icon: <Table size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run();
        }
      },
      keywords: ['tabla', 'table', 'grid'],
    },
    {
      title: 'Callout',
      description: 'Create a callout',
      icon: <Lightbulb size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setCallout({ icon: 'lightbulb', color: 'yellow' }).run();
        }
      },
      keywords: ['callout', 'nota', 'advertencia'],
    },
    {
      title: 'Toggle',
      description: 'Create collapsible content',
      icon: <ChevronRight size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setToggle().run();
        }
      },
      keywords: ['toggle', 'colapsar', 'expandir'],
    },
    {
      title: 'Divider',
      description: 'Insert a divider',
      icon: <Minus size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setDivider().run();
        }
      },
      keywords: ['divisor', 'divider', 'hr', 'separador'],
    },
    {
      title: 'Code',
      description: 'Insert code block',
      icon: <Code size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        }
      },
      keywords: ['codigo', 'code', 'programacion'],
    },
    {
      title: 'Mermaid',
      description: 'Insertar diagrama Mermaid',
      icon: <Workflow size={18} />,
      category: 'Advanced',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setMermaid().run();
        }
      },
      keywords: ['mermaid', 'merm', 'diagrama', 'diagram', 'flowchart', 'sequence', 'graph'],
    },
    // Referencias
    {
      title: 'Mention resource',
      description: 'Mention another resource',
      icon: <AtSign size={18} />,
      category: 'Referencias',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const searchQuery = await showPrompt('Search resource by name:');
          if (searchQuery && typeof window !== 'undefined' && window.electron?.db?.resources) {
            try {
              const result = await window.electron.db.resources.search(searchQuery);
              if (result?.success && result.data && result.data.length > 0) {
                // Show a simple selection if multiple results
                let selectedResource = result.data[0]!;

                if (result.data.length > 1) {
                  const options = result.data.slice(0, 5).map((r: { title: string }, i: number) =>
                    `${i + 1}. ${r.title}`
                  ).join('\n');
                  const selection = await showPrompt(
                    `${result.data.length} resources found:\n${options}\n\nEnter the number (1-${Math.min(5, result.data.length)}):`
                  );
                  const idx = parseInt(selection || '1', 10) - 1;
                  if (idx >= 0 && idx < result.data.length) {
                    selectedResource = result.data[idx]!;
                  }
                }

                // Insert resource mention
                editor.chain().focus().insertContent({
                  type: 'resourceMention',
                  attrs: {
                    resourceId: selectedResource.id,
                    title: selectedResource.title,
                    type: selectedResource.type,
                    label: selectedResource.title,
                  },
                }).run();
              } else {
                window.alert('No resources found with that name.');
              }
            } catch (error) {
              console.error('Error searching resources:', error);
              window.alert('Error searching resources.');
            }
          }
        }
      },
      keywords: ['mencion', 'mention', '@', 'recurso'],
    },
    {
      title: 'Internal link',
      description: 'Create link to another note',
      icon: <Link size={18} />,
      category: 'Referencias',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const searchQuery = await showPrompt('Search note by name:');
          if (searchQuery && typeof window !== 'undefined' && window.electron?.db?.resources) {
            try {
              // Search for notes specifically
              const result = await window.electron.db.resources.search(searchQuery);
              if (result?.success && result.data) {
                // Filter only notes
                const notes = result.data.filter((r: { type: string }) => r.type === 'note');

                if (notes.length > 0) {
                  let selectedNote = notes[0]!;

                  if (notes.length > 1) {
                    const options = notes.slice(0, 5).map((r: { title: string }, i: number) =>
                      `${i + 1}. ${r.title}`
                    ).join('\n');
                    const selection = await showPrompt(
                      `${notes.length} notes found:\n${options}\n\nEnter the number (1-${Math.min(5, notes.length)}):`
                    );
                    const idx = parseInt(selection || '1', 10) - 1;
                    if (idx >= 0 && idx < notes.length) {
                      selectedNote = notes[idx]!;
                    }
                  }

                  // Insert internal link
                  editor.chain().focus().insertContent([
                    {
                      type: 'text',
                      marks: [{
                        type: 'link',
                        attrs: {
                          href: `dome://resource/${selectedNote.id}`,
                          target: '_self',
                          class: 'internal-link',
                        },
                      }],
                      text: selectedNote.title,
                    },
                    {
                      type: 'text',
                      text: ' ',
                    },
                  ]).run();
                } else {
                  window.alert('No notes found with that name.');
                }
              }
            } catch (error) {
              console.error('Error searching notes:', error);
              window.alert('Error al buscar notas.');
            }
          }
        }
      },
      keywords: ['enlace', 'link', 'interno'],
    },
    // AI
    {
      title: 'Ask Many',
      description: 'Generate content with AI',
      icon: <Sparkles size={18} />,
      category: 'AI',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const prompt = await showPrompt('What would you like Many to write?');
          if (prompt) {
            try {
              const { executeEditorAIAction } = await import('@/lib/ai/editor-ai');
              const docContext = editor.getText().slice(0, 2000);
              const result = await executeEditorAIAction('custom', '', docContext, prompt);
              if (result) {
                editor.chain().focus().insertContent(markdownToHtml(result)).run();
              }
            } catch (error) {
              console.error('AI generation error:', error);
            }
          }
        }
      },
      keywords: ['ai', 'ia', 'many', 'generate', 'write', 'crear', 'generar'],
    },
    {
      title: 'Summarize document',
      description: 'Summarize the current document',
      icon: <BookOpen size={18} />,
      category: 'AI',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          try {
            const { executeEditorAIAction } = await import('@/lib/ai/editor-ai');
            const fullText = editor.getText();
            if (!fullText.trim()) return;

            const result = await executeEditorAIAction('summarize', fullText, '');
            if (result) {
              editor
                .chain()
                .focus()
                .setCallout({ icon: 'file-text', color: 'blue' })
                .insertContent(markdownToHtml(result))
                .run();
            }
          } catch (error) {
            console.error('AI summarize error:', error);
          }
        }
      },
      keywords: ['ai', 'ia', 'summarize', 'resumen', 'resumir'],
    },
    {
      title: 'Continue writing',
      description: 'Expand from current position',
      icon: <PenLine size={18} />,
      category: 'AI',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          try {
            const { executeEditorAIAction } = await import('@/lib/ai/editor-ai');
            // Get text before cursor as context
            const { from } = editor.state.selection;
            const textBefore = editor.state.doc.textBetween(0, from, '\n');
            const contextSlice = textBefore.slice(-2000);

            const result = await executeEditorAIAction('continue', contextSlice, '');
            if (result) {
              editor.chain().focus().insertContent(markdownToHtml(result)).run();
            }
          } catch (error) {
            console.error('AI continue error:', error);
          }
        }
      },
      keywords: ['ai', 'ia', 'continue', 'continuar', 'expand', 'more'],
    },
    {
      title: 'Translate',
      description: 'Translate content to another language',
      icon: <Languages size={18} />,
      category: 'AI',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();

          const language = await showPrompt('Translate to which language? (e.g. English, Spanish, French)');
          if (language) {
            try {
              const { executeEditorAIAction } = await import('@/lib/ai/editor-ai');
              const fullText = editor.getText();
              if (!fullText.trim()) return;

              const result = await executeEditorAIAction(
                'custom',
                fullText,
                '',
                `Translate the following text to ${language}. Return only the translated text, preserving all formatting.`
              );
              if (result) {
                // Replace entire content with translation (convert markdown to HTML)
                editor.commands.setContent(markdownToHtml(result));
              }
            } catch (error) {
              console.error('AI translate error:', error);
            }
          }
        }
      },
      keywords: ['ai', 'ia', 'translate', 'traducir', 'idioma', 'language'],
    },
  ];
}
