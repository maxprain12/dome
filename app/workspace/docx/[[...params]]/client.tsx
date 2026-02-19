'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import NotionEditor from '@/components/editor/NotionEditor';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import SidePanel from '@/components/workspace/SidePanel';
import SourcesPanel from '@/components/workspace/SourcesPanel';
import StudioPanel from '@/components/workspace/StudioPanel';
import GraphPanel from '@/components/workspace/GraphPanel';
import StudioOutputViewer from '@/components/workspace/StudioOutputViewer';
import MetadataModal from '@/components/workspace/MetadataModal';
import { useAppStore } from '@/lib/store/useAppStore';
import { looksLikeHtml, htmlToMarkdown } from '@/lib/utils/markdown';
import { contentToHtmlBody } from '@/lib/utils/note-to-html';
import { type Resource } from '@/types';

/**
 * Detect if content is legacy Tiptap JSON.
 */
function isJsonContent(content: string): boolean {
  if (!content) return false;
  const t = content.trim();
  return t.startsWith('{') && t.includes('"type"') && t.includes('"doc"');
}

/**
 * Content to pass to editor. HTML from mammoth -> Markdown. Legacy -> as-is.
 */
function contentForEditor(content: string): string {
  if (!content) return '';
  if (isJsonContent(content)) return content;
  if (looksLikeHtml(content)) return htmlToMarkdown(content);
  return content;
}

interface DocxWorkspaceClientProps {
  resourceId: string;
}

export default function DocxWorkspaceClient({ resourceId }: DocxWorkspaceClientProps) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const sourcesPanelOpen = useAppStore((s) => s.sourcesPanelOpen);
  const studioPanelOpen = useAppStore((s) => s.studioPanelOpen);
  const graphPanelOpen = useAppStore((s) => s.graphPanelOpen);
  const activeStudioOutput = useAppStore((s) => s.activeStudioOutput);
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const savedFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventScroll = () => {
      if (el.scrollTop !== 0) el.scrollTop = 0;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
    };
    el.addEventListener('scroll', preventScroll);
    return () => el.removeEventListener('scroll', preventScroll);
  }, []);

  // Load resource and content (from file or DB)
  useEffect(() => {
    async function loadResource() {
      if (!window.electron?.db?.resources) {
        setError('Database not available');
        setLoading(false);
        return;
      }

      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (!result?.success || !result.data) {
          setError('Document not found');
          setLoading(false);
          return;
        }

        const res = result.data;
        setResource(res);
        setTitle(res.title || '');

        let initialContent = '';
        if (res.internal_path) {
          const docResult = await window.electron.resource.readDocumentContent(resourceId);
          if (docResult.success && docResult.data) {
            const binary = atob(docResult.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const mammoth = await import('mammoth');
            const mammothResult = await mammoth.convertToHtml(
              { arrayBuffer: bytes.buffer },
              {
                styleMap: [
                  "p[style-name='Heading 1'] => h1:fresh",
                  "p[style-name='Heading 2'] => h2:fresh",
                  "p[style-name='Heading 3'] => h3:fresh",
                ],
              }
            );
            initialContent = contentForEditor(mammothResult.value);
          } else {
            initialContent = contentForEditor(res.content || '');
          }
        } else {
          initialContent = contentForEditor(res.content || '');
        }

        setContent(initialContent);
        lastSavedContentRef.current = initialContent;
      } catch (err) {
        console.error('Error loading document:', err);
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    }

    loadResource();
  }, [resourceId]);

  useEffect(() => {
    if (resourceId) {
      useAppStore.getState().setSelectedSourceIds([resourceId]);
    }
  }, [resourceId]);

  const saveContent = useCallback(async (newContent: string) => {
    if (!window.electron?.resource?.saveDocxFromHtml || !resource) return;
    if (newContent === lastSavedContentRef.current) return;

    setIsSaving(true);
    setLastSavedAt(null);
    try {
      const html = contentToHtmlBody(newContent);
      const result = await window.electron.resource.saveDocxFromHtml(resourceId, html);
      if (result.success && result.data) {
        lastSavedContentRef.current = newContent;
        setResource(result.data);
        setLastSavedAt(Date.now());
        if (savedFeedbackTimeoutRef.current) clearTimeout(savedFeedbackTimeoutRef.current);
        savedFeedbackTimeoutRef.current = setTimeout(() => setLastSavedAt(null), 2500);
      }
    } catch (err) {
      console.error('Error saving document:', err);
    } finally {
      setIsSaving(false);
    }
  }, [resourceId, resource]);

  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveContent(content);
  }, [content, saveContent]);

  const handleContentChange = useCallback((markdownFromEditor: string) => {
    setContent(markdownFromEditor);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveContent(markdownFromEditor);
    }, 1000);
  }, [saveContent]);

  const handleTitleBlur = useCallback(async () => {
    if (!window.electron?.db?.resources || !resource) return;
    if (title === resource.title) return;

    try {
      await window.electron.db.resources.update({
        id: resourceId,
        title,
        content: resource.content || null,
        updated_at: Date.now(),
      });
      setResource({ ...resource, title });
    } catch (err) {
      console.error('Error saving title:', err);
    }
  }, [resourceId, resource, title]);

  const handleExportDocx = useCallback(async () => {
    if (!resource || !window.electron?.resource?.export) return;
    try {
      const filePath = await window.electron.showSaveDialog({
        defaultPath: (title || 'Document').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.docx',
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });
      if (filePath) {
        const result = await window.electron.resource.export(resourceId, filePath);
        if (result?.success && result?.data && window.electron?.openPath) {
          await window.electron.openPath(result.data);
        }
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  }, [resourceId, resource, title]);

  const handleSaveMetadata = useCallback(async (updates: Partial<Resource>): Promise<boolean> => {
    if (!resource || typeof window === 'undefined' || !window.electron) return false;

    try {
      const updatedResource = {
        ...resource,
        ...updates,
        updated_at: Date.now(),
      };

      const result = await window.electron.db.resources.update(updatedResource);

      if (result.success) {
        setResource(updatedResource);
        if (updates.title) setTitle(updates.title);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error saving metadata:', err);
      return false;
    }
  }, [resource]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savedFeedbackTimeoutRef.current) clearTimeout(savedFeedbackTimeoutRef.current);
    };
  }, []);

  const hasUnsavedChanges = content !== lastSavedContentRef.current;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="animate-pulse" style={{ color: 'var(--secondary-text)' }}>Loading document...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--bg)' }}>
        <div style={{ color: 'var(--error)' }}>{error || 'Document not found'}</div>
        <button
          onClick={() => { if (typeof window !== 'undefined') window.close(); }}
          className="btn btn-primary"
        >
          Close Window
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)', overflow: 'clip' }}>
      <WorkspaceHeader
        resource={resource}
        sidePanelOpen={isPanelOpen}
        onToggleSidePanel={() => setIsPanelOpen(!isPanelOpen)}
        onShowMetadata={() => setShowMetadata(true)}
        onExportDocx={handleExportDocx}
        editableTitle={{
          value: title,
          onChange: setTitle,
          onBlur: handleTitleBlur,
          placeholder: 'Untitled Document',
        }}
        savingIndicator={
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={isSaving || !hasUnsavedChanges}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: hasUnsavedChanges ? 'var(--accent)' : 'var(--bg-secondary)',
                color: hasUnsavedChanges ? 'white' : 'var(--secondary-text)',
                border: '1px solid var(--border)',
              }}
              title={hasUnsavedChanges ? 'Guardar ahora' : 'Guardado'}
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              <span>{isSaving ? 'Guardando...' : 'Guardar'}</span>
            </button>
            {isSaving && (
              <span className="text-xs" style={{ color: 'var(--secondary-text)' }}>Guardando automáticamente...</span>
            )}
            {lastSavedAt && !isSaving && (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--success, #22c55e)' }}>
                <Check size={12} />
                Guardado
              </span>
            )}
          </div>
        }
      />

      <div className="flex-1 flex relative min-h-0" style={{ overflow: 'clip' }}>
        {sourcesPanelOpen && resource && (
          <SourcesPanel
            resourceId={resourceId}
            projectId={resource.project_id}
          />
        )}

        <div className="flex-1 relative min-h-0" style={{ overflow: 'clip' }}>
          <div className="h-full overflow-auto p-6">
            <div className="note-editor-with-guides w-full">
              <NotionEditor
                content={contentForEditor(content)}
                contentType="markdown"
                onChange={handleContentChange}
                placeholder="Escribe '/' para comandos..."
              />
            </div>
          </div>

          {activeStudioOutput && (
            <StudioOutputViewer
              output={activeStudioOutput}
              onClose={() => setActiveStudioOutput(null)}
            />
          )}
        </div>

        <SidePanel
          resourceId={resourceId}
          resource={resource}
          isOpen={isPanelOpen}
          onClose={() => setIsPanelOpen(false)}
        />

        {studioPanelOpen && resource && (
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} />
        )}

        {graphPanelOpen && resource && (
          <GraphPanel resource={resource} />
        )}
      </div>

      <MetadataModal
        resource={resource}
        isOpen={showMetadata}
        onClose={() => setShowMetadata(false)}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
