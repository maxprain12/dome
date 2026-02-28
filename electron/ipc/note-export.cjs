/**
 * IPC handlers for exporting notes to PDF, DOCX, Markdown, HTML and tree ZIP.
 */

const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function sanitizeFilename(name) {
  return (name || 'untitled').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
}

function register({ ipcMain, windowManager, docxConverter, database, fileStorage }) {
  /**
   * Export note content (as HTML) to PDF.
   * Opens save dialog, creates hidden window, loads HTML, prints to PDF.
   */
  ipcMain.handle('note:exportToPdf', async (event, { html, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'No window' };
    }

    try {
      const defaultName = (title || 'Note').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.pdf';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      const pdfWindow = new BrowserWindow({
        width: 800,
        height: 1000,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false, // Allow loading Mermaid from CDN for diagram rendering
        },
      });

      const tempDir = app.getPath('temp');
      const tempPath = path.join(tempDir, `dome-pdf-export-${Date.now()}.html`);
      try {
        fs.writeFileSync(tempPath, html || '<p></p>', 'utf8');
        await new Promise((resolve, reject) => {
          pdfWindow.webContents.once('did-finish-load', resolve);
          pdfWindow.webContents.once('did-fail-load', (_, code, desc) => {
            reject(new Error(`Load failed: ${code} ${desc}`));
          });
          pdfWindow.loadFile(tempPath).catch(reject);
        });
      } finally {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
      }

      // Wait for Mermaid diagrams to render if present
      const hasMermaid = /data-type="mermaid"/.test(html || '');
      if (hasMermaid) {
        await pdfWindow.webContents.executeJavaScript(`
          (async () => {
            for (let i = 0; i < 60; i++) {
              if (window.__mermaidReady) return;
              await new Promise(r => setTimeout(r, 200));
            }
          })()
        `);
      }

      const pdfBuffer = await pdfWindow.webContents.printToPDF({
        marginsType: 0,
        printBackground: true,
        landscape: false,
      });

      pdfWindow.destroy();

      fs.writeFileSync(filePath, pdfBuffer);

      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] PDF export error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });

  /**
   * Export note content (as HTML) to DOCX.
   */
  ipcMain.handle('note:exportToDocx', async (event, { html, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!docxConverter) {
      return { success: false, error: 'DOCX converter not available' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, error: 'No window' };
    }

    try {
      const defaultName = (title || 'Note').replace(/[<>:"/\\|?*]/g, '_').substring(0, 80) + '.docx';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });

      if (canceled || !filePath) {
        return { success: false, canceled: true };
      }

      const body = typeof html === 'string' && html.trim() ? html : '<p></p>';
      const buffer = await docxConverter.htmlToDocxBuffer(body);
      if (!buffer) {
        return { success: false, error: 'Failed to convert to DOCX' };
      }

      fs.writeFileSync(filePath, buffer);
      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] DOCX export error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });

  /**
   * Export note to Markdown (single file).
   */
  ipcMain.handle('note:exportToMarkdown', async (event, { markdown, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };

    try {
      const defaultName = sanitizeFilename(title) + '.md';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      fs.writeFileSync(filePath, markdown || '', 'utf8');
      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] Markdown export error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });

  /**
   * Export note to HTML (single file).
   */
  ipcMain.handle('note:exportToHtml', async (event, { html, title }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };

    try {
      const defaultName = sanitizeFilename(title) + '.html';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: defaultName,
        filters: [{ name: 'HTML', extensions: ['html'] }],
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      const fullHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${(title || 'Note').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
</head>
<body>${html || ''}</body>
</html>`;

      fs.writeFileSync(filePath, fullHtml, 'utf8');
      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] HTML export error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });

  /**
   * Get note tree for export (note + descendants). Used by renderer to build ZIP.
   */
  ipcMain.handle('note:getTreeForExport', async (event, { noteId, includeChildren }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    if (!database) return { success: false, error: 'Database not available' };

    try {
      const queries = database.getQueries();
      const root = queries.getNoteById.get(noteId);
      if (!root) return { success: false, error: 'Note not found' };

      const notes = [root];

      if (includeChildren) {
        function collectChildren(parentId) {
          const children = queries.getChildNotes.all(parentId);
          for (const c of children) {
            notes.push(c);
            collectChildren(c.id);
          }
        }
        collectChildren(noteId);
      }

      return {
        success: true,
        data: notes.map((n) => ({
          id: n.id,
          slug_id: n.slug_id,
          title: n.title,
          content_json: n.content_json,
          parent_note_id: n.parent_note_id,
          position: n.position,
        })),
      };
    } catch (error) {
      console.error('[Note Export] getTreeForExport error:', error);
      return { success: false, error: error?.message || 'Failed to get tree' };
    }
  });

  /**
   * Create export ZIP with optional attachments (main process builds ZIP).
   */
  ipcMain.handle('note:createExportZip', async (event, { files, attachments, defaultName }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };

    if (!database || !fileStorage) {
      return { success: false, error: 'Storage not available' };
    }

    try {
      const archiver = require('archiver');
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: sanitizeFilename(defaultName || 'export') + '.zip',
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 6 } });

      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        for (const f of files || []) {
          archive.append(f.content || '', { name: f.path });
        }

        const queries = database.getQueries();
        for (const a of attachments || []) {
          try {
            const resource = queries.getResourceById.get(a.resourceId);
            if (resource && (resource.internal_path || resource.file_path)) {
              const fullPath = resource.internal_path
                ? fileStorage.getFullPath(resource.internal_path)
                : resource.file_path;
              if (fs.existsSync(fullPath)) {
                const baseName = (resource.original_filename || resource.title || 'file').replace(/[<>:"/\\|?*]/g, '_');
                const zipPath = a.pathInZip || `files/${a.resourceId}/${baseName}`;
                archive.file(fullPath, { name: zipPath });
              }
            }
          } catch (err) {
            console.warn('[Note Export] Skip attachment:', a.resourceId, err?.message);
          }
        }

        archive.finalize();
      });

      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] createExportZip error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });

  /**
   * Save export ZIP buffer to file (renderer builds ZIP, sends buffer).
   */
  ipcMain.handle('note:saveExportZip', async (event, { buffer, defaultName }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'No window' };

    try {
      const name = sanitizeFilename(defaultName || 'export') + '.zip';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: name,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      });

      if (canceled || !filePath) return { success: false, canceled: true };

      const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
      fs.writeFileSync(filePath, buf);
      return { success: true, path: filePath };
    } catch (error) {
      console.error('[Note Export] saveExportZip error:', error);
      return { success: false, error: error?.message || 'Export failed' };
    }
  });
}

module.exports = { register };
