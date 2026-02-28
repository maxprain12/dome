'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { extractResourceIdsFromContent } from '@/lib/utils/content-resources';
import { replaceMentionsWithRelativePaths } from '@/lib/utils/export-utils';

export type ExportFormat = 'markdown' | 'html' | 'pdf';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  noteId: string;
  title: string;
  content: string;
  isNoteFromNewDomain: boolean;
  onExportPdf?: () => void | Promise<void>;
}

export default function ExportModal({
  open,
  onClose,
  noteId,
  title,
  content,
  isNoteFromNewDomain,
  onExportPdf,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!window.electron?.note) return;
    setIsExporting(true);
    try {
      if (format === 'pdf' && onExportPdf) {
        await onExportPdf();
        onClose();
        return;
      }
      const { contentToHtmlBody } = await import('@/lib/utils/note-to-html');
      const { htmlToMarkdown } = await import('@/lib/utils/markdown');

      if (format === 'markdown' || format === 'html') {
        const defaultName = (title || 'export').replace(/[<>:"/\\|?*]/g, '_').substring(0, 60);
        const ext = format === 'markdown' ? '.md' : '.html';
        const safeTitle = (title || 'note').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
        const body = contentToHtmlBody(content);
        const fileContent = format === 'markdown' ? htmlToMarkdown(body) : body;
        const noteIdToPath = { [noteId]: `${safeTitle}${ext}` };
        const contentWithLinks = replaceMentionsWithRelativePaths(
          fileContent,
          noteIdToPath,
          `${safeTitle}${ext}`,
          format
        );

        if (includeAttachments && isNoteFromNewDomain && window.electron.note.createExportZip) {
          const resourceIds = new Set<string>();
          extractResourceIdsFromContent(content).forEach((id) => resourceIds.add(id));
          const files = [{ path: `${safeTitle}${ext}`, content: contentWithLinks }];
          const attachments = Array.from(resourceIds).map((resourceId) => ({ resourceId }));
          const result = await window.electron.note.createExportZip({
            files,
            attachments,
            defaultName,
          });
          if (result?.success && result.path) {
            await window.electron.openPath(result.path);
          }
        } else {
          const singleResult =
            format === 'markdown'
              ? await window.electron.note.exportToMarkdown({
                  markdown: contentWithLinks,
                  title,
                })
              : await window.electron.note.exportToHtml({
                  html: contentWithLinks,
                  title,
                });
          if (singleResult?.success && singleResult.path) {
            await window.electron.openPath(singleResult.path);
          }
        }
      }
      onClose();
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div
        className="rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
        style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 id="export-modal-title" className="text-sm font-semibold" style={{ color: 'var(--primary-text)' }}>
            Export note
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            style={{ color: 'var(--secondary-text)' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label
              htmlFor="export-format"
              className="block text-xs font-medium mb-1.5"
              style={{ color: 'var(--secondary-text)' }}
            >
              Format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--primary-text)',
              }}
            >
              <option value="markdown">Markdown (.md)</option>
              <option value="html">HTML (.html)</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          {isNoteFromNewDomain && (format === 'markdown' || format === 'html') && (
            <div className="flex items-center justify-between">
              <label
                htmlFor="include-attachments"
                className="text-sm"
                style={{ color: 'var(--primary-text)' }}
              >
                Include attachments
              </label>
              <input
                id="include-attachments"
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="rounded"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--bg-secondary)', color: 'var(--primary-text)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
