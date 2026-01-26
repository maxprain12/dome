'use client';

import { useEffect, useState, useRef } from 'react';
import { useEditor } from '@tiptap/react';
import { Editor } from '@tiptap/core';
import { SlashCommandPluginKey, SlashCommandState } from './extensions/SlashCommandPlugin';
import { SlashCommandItem } from './extensions/SlashCommand';
import { showPrompt } from '@/lib/store/usePromptStore';

interface SlashCommandMenuProps {
  editor: Editor;
}

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
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

    return () => {
      editor.off('update', update);
      editor.off('selectionUpdate', update);
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

  if (!state.show || state.items.length === 0) {
    return null;
  }

  const groupedItems = state.items.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, SlashCommandItem[]>);

  // Calculate position
  const { from } = editor.state.selection;
  const coords = editor.view.coordsAtPos(from);
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${coords.left}px`,
    top: `${coords.bottom + 8}px`,
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    maxHeight: '300px',
    overflowY: 'auto',
    zIndex: 1000,
    minWidth: '280px',
    padding: '4px',
  };

  return (
    <div ref={menuRef} className="slash-command-menu" style={menuStyle}>
      {Object.entries(groupedItems).map(([category, categoryItems]) => (
        <div key={category}>
          <div
            style={{
              padding: '8px 12px',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: 'var(--secondary)',
              letterSpacing: '0.5px',
            }}
          >
            {category}
          </div>
          {categoryItems.map((item, index) => {
            const globalIndex = state.items.indexOf(item);
            return (
              <div
                key={item.title}
                data-index={globalIndex}
                onClick={() => {
                  if (state.range) {
                    item.command({
                      editor,
                      range: state.range,
                    });
                  }
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: globalIndex === state.selectedIndex ? 'var(--bg-hover)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
                onMouseEnter={() => {
                  // Update selected index via plugin
                  const newState = { ...state, selectedIndex: globalIndex };
                  SlashCommandPluginKey.getState(editor.state);
                }}
              >
                {item.icon && (
                  <div style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', fontSize: '18px' }}>
                    {item.icon}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 500 }}>
                    {item.title}
                  </div>
                  {item.description && (
                    <div style={{ color: 'var(--secondary)', fontSize: '12px', marginTop: '2px' }}>
                      {item.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function getSlashCommandItems(): SlashCommandItem[] {
  return [
    // Básico
    {
      title: 'Texto',
      description: 'Empezar a escribir texto',
      icon: '📝',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setParagraph().run();
        }
      },
      keywords: ['texto', 'parrafo', 'p'],
    },
    {
      title: 'Título 1',
      description: 'Título grande',
      icon: 'H1',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run();
        }
      },
      keywords: ['h1', 'titulo', 'heading'],
    },
    {
      title: 'Título 2',
      description: 'Título mediano',
      icon: 'H2',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run();
        }
      },
      keywords: ['h2', 'subtitulo'],
    },
    {
      title: 'Título 3',
      description: 'Título pequeño',
      icon: 'H3',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run();
        }
      },
      keywords: ['h3'],
    },
    {
      title: 'Lista con viñetas',
      description: 'Crear una lista con viñetas',
      icon: '•',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleBulletList().run();
        }
      },
      keywords: ['lista', 'bullet', 'viñetas'],
    },
    {
      title: 'Lista numerada',
      description: 'Crear una lista numerada',
      icon: '1.',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run();
        }
      },
      keywords: ['numerada', 'ordenada', 'numbered'],
    },
    {
      title: 'Lista de tareas',
      description: 'Crear una lista de tareas',
      icon: '☑',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleTaskList().run();
        }
      },
      keywords: ['todo', 'tareas', 'checklist'],
    },
    {
      title: 'Cita',
      description: 'Crear una cita',
      icon: '"',
      category: 'Básico',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run();
        }
      },
      keywords: ['quote', 'cita', 'blockquote'],
    },
    // Media
    {
      title: 'Imagen',
      description: 'Insertar una imagen',
      icon: '🖼️',
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          const url = await showPrompt('URL de la imagen:');
          if (url) {
            editor.chain().focus().deleteRange(range).setImage({ src: url }).run();
          }
        }
      },
      keywords: ['imagen', 'image', 'img'],
    },
    {
      title: 'PDF',
      description: 'Embeber un PDF',
      icon: '📄',
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          if (typeof window !== 'undefined' && window.electron?.selectFile) {
            try {
              const filePaths = await window.electron.selectFile({
                filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
                title: 'Seleccionar PDF',
              });
              
              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0];
                const filename = filePath.split('/').pop() || 'document.pdf';
                
                // Insert PDF embed node
                editor.chain().focus().insertContent({
                  type: 'pdfEmbed',
                  attrs: {
                    resourceId: '',
                    filePath: filePath,
                    filename: filename,
                  },
                }).run();
              }
            } catch (error) {
              console.error('Error selecting PDF:', error);
            }
          }
        }
      },
      keywords: ['pdf', 'documento'],
    },
    {
      title: 'Video',
      description: 'Embeber un video',
      icon: '🎬',
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          const url = await showPrompt('URL del video (YouTube, Vimeo, o archivo):');
          if (url) {
            // Check if it's a YouTube URL
            const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
            if (youtubeMatch) {
              const videoId = youtubeMatch[1];
              editor.chain().focus().insertContent({
                type: 'paragraph',
                content: [{
                  type: 'text',
                  text: `[Video: ${url}]`,
                }],
              }).run();
              
              // Insert YouTube embed as iframe
              editor.chain().focus().insertContent({
                type: 'videoEmbed',
                attrs: {
                  src: `https://www.youtube.com/embed/${videoId}`,
                  provider: 'youtube',
                  videoId: videoId,
                },
              }).run();
            } else {
              // Regular video URL
              editor.chain().focus().insertContent({
                type: 'videoEmbed',
                attrs: {
                  src: url,
                  provider: 'direct',
                },
              }).run();
            }
          }
        }
      },
      keywords: ['video', 'youtube'],
    },
    {
      title: 'Audio',
      description: 'Embeber audio',
      icon: '🎵',
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          const url = await showPrompt('URL del audio o seleccionar archivo:');
          if (url) {
            editor.chain().focus().insertContent({
              type: 'audioEmbed',
              attrs: {
                src: url,
              },
            }).run();
          } else if (typeof window !== 'undefined' && window.electron?.selectFile) {
            try {
              const filePaths = await window.electron.selectFile({
                filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] }],
                title: 'Seleccionar Audio',
              });
              
              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0];
                editor.chain().focus().insertContent({
                  type: 'audioEmbed',
                  attrs: {
                    src: filePath,
                    isLocal: true,
                  },
                }).run();
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
      title: 'Archivo',
      description: 'Insertar un archivo',
      icon: '📎',
      category: 'Media',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          if (typeof window !== 'undefined' && window.electron?.selectFile) {
            try {
              const filePaths = await window.electron.selectFile({
                title: 'Seleccionar Archivo',
              });
              
              if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0];
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
      title: 'Tabla',
      description: 'Insertar una tabla',
      icon: '⊞',
      category: 'Avanzado',
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
      description: 'Crear un callout',
      icon: '💡',
      category: 'Avanzado',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setCallout({ icon: '💡', color: 'yellow' }).run();
        }
      },
      keywords: ['callout', 'nota', 'advertencia'],
    },
    {
      title: 'Toggle',
      description: 'Crear contenido colapsable',
      icon: '▶',
      category: 'Avanzado',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setToggle().run();
        }
      },
      keywords: ['toggle', 'colapsar', 'expandir'],
    },
    {
      title: 'Divisor',
      description: 'Insertar un divisor',
      icon: '—',
      category: 'Avanzado',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).setDivider().run();
        }
      },
      keywords: ['divisor', 'divider', 'hr', 'separador'],
    },
    {
      title: 'Código',
      description: 'Insertar bloque de código',
      icon: '</>',
      category: 'Avanzado',
      command: ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
        }
      },
      keywords: ['codigo', 'code', 'programacion'],
    },
    // Referencias
    {
      title: 'Mencionar recurso',
      description: 'Mencionar otro recurso',
      icon: '@',
      category: 'Referencias',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          const searchQuery = await showPrompt('Buscar recurso por nombre:');
          if (searchQuery && typeof window !== 'undefined' && window.electron?.db?.resources) {
            try {
              const result = await window.electron.db.resources.searchForMention(searchQuery);
              if (result?.success && result.data && result.data.length > 0) {
                // Show a simple selection if multiple results
                let selectedResource = result.data[0];
                
                if (result.data.length > 1) {
                  const options = result.data.slice(0, 5).map((r: { title: string }, i: number) => 
                    `${i + 1}. ${r.title}`
                  ).join('\n');
                  const selection = await showPrompt(
                    `Se encontraron ${result.data.length} recursos:\n${options}\n\nIngresa el número (1-${Math.min(5, result.data.length)}):`
                  );
                  const idx = parseInt(selection || '1', 10) - 1;
                  if (idx >= 0 && idx < result.data.length) {
                    selectedResource = result.data[idx];
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
                window.alert('No se encontraron recursos con ese nombre.');
              }
            } catch (error) {
              console.error('Error searching resources:', error);
              window.alert('Error al buscar recursos.');
            }
          }
        }
      },
      keywords: ['mencion', 'mention', '@', 'recurso'],
    },
    {
      title: 'Enlace interno',
      description: 'Crear enlace a otra nota',
      icon: '🔗',
      category: 'Referencias',
      command: async ({ editor, range }) => {
        if (editor && range) {
          editor.chain().focus().deleteRange(range).run();
          
          const searchQuery = await showPrompt('Buscar nota por nombre:');
          if (searchQuery && typeof window !== 'undefined' && window.electron?.db?.resources) {
            try {
              // Search for notes specifically
              const result = await window.electron.db.resources.search(searchQuery);
              if (result?.success && result.data) {
                // Filter only notes
                const notes = result.data.filter((r: { type: string }) => r.type === 'note');
                
                if (notes.length > 0) {
                  let selectedNote = notes[0];
                  
                  if (notes.length > 1) {
                    const options = notes.slice(0, 5).map((r: { title: string }, i: number) => 
                      `${i + 1}. ${r.title}`
                    ).join('\n');
                    const selection = await showPrompt(
                      `Se encontraron ${notes.length} notas:\n${options}\n\nIngresa el número (1-${Math.min(5, notes.length)}):`
                    );
                    const idx = parseInt(selection || '1', 10) - 1;
                    if (idx >= 0 && idx < notes.length) {
                      selectedNote = notes[idx];
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
                  window.alert('No se encontraron notas con ese nombre.');
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
  ];
}
