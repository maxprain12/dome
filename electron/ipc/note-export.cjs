/**
 * IPC handlers for exporting notes to PDF and DOCX.
 */

const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function register({ ipcMain, windowManager, docxConverter }) {
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

      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html || '');

      await new Promise((resolve, reject) => {
        pdfWindow.webContents.once('did-finish-load', resolve);
        pdfWindow.webContents.once('did-fail-load', (_, code, desc) => {
          reject(new Error(`Load failed: ${code} ${desc}`));
        });
        pdfWindow.loadURL(dataUrl).catch(reject);
      });

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
}

module.exports = { register };
