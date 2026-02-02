/**
 * Ollama Manager - Native Ollama Integration
 *
 * This module manages Ollama binaries and server lifecycle using electron-ollama.
 * It provides zero-configuration Ollama integration with automatic download and startup.
 *
 * Key features:
 * - Automatic binary download and management
 * - Platform-specific binary handling (Windows, macOS, Linux)
 * - Conflict detection with standalone Ollama instances
 * - Progress tracking for downloads
 * - Graceful server lifecycle management
 */

const { ElectronOllama } = require('electron-ollama');
const { app } = require('electron');
const path = require('path');

class OllamaManager {
  constructor() {
    this.eo = null;
    this.status = 'stopped'; // 'stopped' | 'starting' | 'downloading' | 'running' | 'error'
    this.currentVersion = null;
    this.downloadProgress = 0;
    this.errorMessage = null;
    this.mainWindow = null;
  }

  /**
   * Initialize the Ollama manager
   * @param {BrowserWindow} mainWindow - Main window for sending status updates
   */
  initialize(mainWindow) {
    this.mainWindow = mainWindow;

    // Initialize ElectronOllama with app's userData path
    this.eo = new ElectronOllama({
      basePath: app.getPath('userData'),
      directory: 'ollama-binaries'
    });

    console.log('[OllamaManager] Initialized with basePath:', app.getPath('userData'));
  }

  /**
   * Check if Ollama is already running (standalone or managed)
   * @returns {Promise<boolean>}
   */
  async isRunning() {
    if (!this.eo) {
      return false;
    }
    return await this.eo.isRunning();
  }

  /**
   * Get current status
   * @returns {Object} Status object with current state
   */
  getStatus() {
    return {
      status: this.status,
      version: this.currentVersion,
      downloadProgress: this.downloadProgress,
      error: this.errorMessage,
      isRunning: this.status === 'running'
    };
  }

  /**
   * Get metadata for a specific version or 'latest'
   * @param {string} version - Version tag or 'latest'
   * @returns {Promise<Object>}
   */
  async getMetadata(version = 'latest') {
    if (!this.eo) {
      throw new Error('OllamaManager not initialized');
    }
    return await this.eo.getMetadata(version);
  }

  /**
   * Check if a specific version is downloaded
   * @param {string} version - Version to check
   * @returns {boolean}
   */
  isDownloaded(version) {
    if (!this.eo) {
      return false;
    }
    return this.eo.isDownloaded(version);
  }

  /**
   * Get list of downloaded versions
   * @returns {string[]}
   */
  getDownloadedVersions() {
    if (!this.eo) {
      return [];
    }
    return this.eo.downloadedVersions();
  }

  /**
   * Handle download progress updates
   * @param {number} percent - Download progress percentage
   */
  handleDownloadProgress(percent) {
    this.downloadProgress = percent;

    // Send progress to renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ollama:download-progress', {
        percent,
        status: this.status
      });
    }

    // Log progress at 10% intervals
    if (percent % 10 === 0) {
      console.log(`[OllamaManager] Download progress: ${percent}%`);
    }
  }

  /**
   * Handle server log messages
   * @param {string} message - Log message from Ollama server
   */
  handleServerLog(message) {
    // Filter out noisy messages
    if (message.includes('Listening on') || message.includes('llama server listening')) {
      console.log('[OllamaManager]', message.trim());
    }

    // Send to renderer for debugging
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('ollama:server-log', message);
    }
  }

  /**
   * Ensure Ollama is running (download if needed, start if not running)
   * @param {string} version - Version to use (default: 'latest')
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async ensureRunning(version = 'latest') {
    try {
      // Check if already running (standalone or managed)
      if (await this.isRunning()) {
        this.status = 'running';
        console.log('[OllamaManager] Ollama is already running');
        return {
          success: true,
          message: 'Ollama is already running'
        };
      }

      // Get version metadata
      this.status = 'starting';
      const metadata = await this.getMetadata(version);
      this.currentVersion = metadata.version;

      console.log(`[OllamaManager] Starting Ollama version ${metadata.version}`);

      // Check if version is downloaded
      if (!this.isDownloaded(metadata.version)) {
        console.log(`[OllamaManager] Version ${metadata.version} not found, downloading...`);
        this.status = 'downloading';
        this.downloadProgress = 0;
      }

      // Start Ollama server (will download if needed)
      await this.eo.serve(metadata.version, {
        serverLog: this.handleServerLog.bind(this),
        downloadLog: this.handleDownloadProgress.bind(this)
      });

      this.status = 'running';
      this.errorMessage = null;
      this.downloadProgress = 100;

      console.log('[OllamaManager] Ollama server started successfully');

      // Notify renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('ollama:status-changed', {
          status: 'running',
          version: this.currentVersion
        });
      }

      return {
        success: true,
        message: `Ollama ${metadata.version} is now running`
      };
    } catch (error) {
      this.status = 'error';
      this.errorMessage = error.message;

      console.error('[OllamaManager] Failed to start Ollama:', error);

      // Notify renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('ollama:status-changed', {
          status: 'error',
          error: error.message
        });
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Stop the Ollama server
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async stop() {
    try {
      const server = this.eo?.getServer();

      if (!server) {
        this.status = 'stopped';
        return {
          success: true,
          message: 'No managed Ollama server running'
        };
      }

      console.log('[OllamaManager] Stopping Ollama server...');

      await server.stop();

      this.status = 'stopped';
      this.currentVersion = null;
      this.downloadProgress = 0;
      this.errorMessage = null;

      console.log('[OllamaManager] Ollama server stopped');

      // Notify renderer
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('ollama:status-changed', {
          status: 'stopped'
        });
      }

      return {
        success: true,
        message: 'Ollama server stopped'
      };
    } catch (error) {
      console.error('[OllamaManager] Error stopping Ollama:', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Download a specific version without starting
   * @param {string} version - Version to download
   * @returns {Promise<{success: boolean, message?: string, error?: string}>}
   */
  async download(version = 'latest') {
    try {
      this.status = 'downloading';
      this.downloadProgress = 0;

      const metadata = await this.getMetadata(version);

      console.log(`[OllamaManager] Downloading Ollama ${metadata.version}...`);

      await this.eo.download(metadata.version, {
        onProgress: this.handleDownloadProgress.bind(this)
      });

      this.downloadProgress = 100;
      this.status = 'stopped';

      console.log(`[OllamaManager] Downloaded Ollama ${metadata.version}`);

      return {
        success: true,
        message: `Downloaded Ollama ${metadata.version}`
      };
    } catch (error) {
      this.status = 'error';
      this.errorMessage = error.message;

      console.error('[OllamaManager] Download failed:', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up on app quit
   */
  async cleanup() {
    if (this.status === 'running') {
      console.log('[OllamaManager] Cleaning up on app quit...');
      await this.stop();
    }
  }
}

// Export singleton instance
module.exports = new OllamaManager();
