/* eslint-disable no-console */
const resourceIndexer = require('../resource-indexer.cjs');

function register({ ipcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService, initModule }) {
  function broadcastResourceUpdated(resourceId, updates) {
    try {
      windowManager.broadcast('resource:updated', { id: resourceId, updates });
    } catch (e) {
      console.error('[Web] Error broadcasting resource:updated', e);
    }
  }
  /**
   * Scrape a URL and extract content + screenshot
   */
  ipcMain.handle('web:scrape', async (event, url) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await webScraper.scrapeUrl(url);
      return result;
    } catch (error) {
      console.error('[Web] Error scraping URL:', error);
      return { success: false, error: error.message, url };
    }
  });

  /**
   * Get YouTube thumbnail
   */
  ipcMain.handle('web:get-youtube-thumbnail', async (event, url) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const result = await youtubeService.getYouTubeThumbnail(url);
      return result;
    } catch (error) {
      console.error('[Web] Error getting YouTube thumbnail:', error);
      return { success: false, error: error.message, url };
    }
  });

  /**
   * Save screenshot to internal storage and update resource thumbnail
   */
  ipcMain.handle('web:save-screenshot', async (event, { resourceId, screenshotBase64, internalPath }) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      // If internalPath is provided, use it; otherwise save from base64
      let finalInternalPath = internalPath;
      let thumbnailData = screenshotBase64;

      if (!internalPath && screenshotBase64) {
        // Save screenshot to internal storage
        const buffer = Buffer.from(screenshotBase64, 'base64');
        const saved = await fileStorage.importFromBuffer(buffer, `screenshot_${resourceId}.png`, 'url');
        finalInternalPath = saved.internalPath;

        // Generate thumbnail data URL
        thumbnailData = fileStorage.readFileAsDataUrl(saved.internalPath);
      }

      // Update resource with thumbnail
      if (thumbnailData) {
        queries.updateResourceThumbnail.run(thumbnailData, Date.now(), resourceId);

        // Update internal_path if needed
        if (finalInternalPath && !resource.internal_path) {
          queries.updateResourceFile.run(
            finalInternalPath,
            'image/png',
            Buffer.from(screenshotBase64 || '', 'base64').length,
            null,
            thumbnailData,
            null,
            Date.now(),
            resourceId
          );
        }
      }

      return { success: true, thumbnailData, internalPath: finalInternalPath };
    } catch (error) {
      console.error('[Web] Error saving screenshot:', error);
      return { success: false, error: error.message };
    }
  });

  /**
   * Process URL resource completely (scrape + screenshot + chunked indexing for semantic search)
   */
  ipcMain.handle('web:process', async (event, resourceId) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);

      if (!resource) {
        return { success: false, error: 'Resource not found' };
      }

      if (resource.type !== 'url') {
        return { success: false, error: 'Resource is not a URL type' };
      }

      const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
      const url = metadata.url || resource.content;

      if (!url) {
        return { success: false, error: 'URL not found in resource' };
      }

      // Update processing status
      metadata.processing_status = 'processing';
      queries.updateResource.run(
        resource.title,
        resource.content,
        JSON.stringify(metadata),
        Date.now(),
        resourceId
      );
      broadcastResourceUpdated(resourceId, { metadata, updated_at: Date.now() });

      // Check if it's YouTube
      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      let thumbnailResult = null;
      let scrapeResult = null;

      if (isYouTube) {
        // Get YouTube thumbnail
        thumbnailResult = await youtubeService.getYouTubeThumbnail(url);

        if (thumbnailResult.success && thumbnailResult.thumbnail) {
          // Save thumbnail
          const screenshotBuffer = Buffer.from(thumbnailResult.thumbnail.dataUrl.split(',')[1], 'base64');
          const saved = await fileStorage.importFromBuffer(
            screenshotBuffer,
            `youtube_${thumbnailResult.videoId}.jpg`,
            'url'
          );

          queries.updateResourceThumbnail.run(
            thumbnailResult.thumbnail.dataUrl,
            Date.now(),
            resourceId
          );

          metadata.video_id = thumbnailResult.videoId;
          metadata.screenshot_path = saved.internalPath;
        }
      } else {
        // Scrape article
        scrapeResult = await webScraper.scrapeUrl(url);

        if (scrapeResult.success) {
          // Save screenshot if available
          if (scrapeResult.screenshot) {
            const isJpeg = scrapeResult.screenshotFormat === 'jpeg';
            const ext = isJpeg ? 'jpg' : 'png';
            const mime = isJpeg ? 'image/jpeg' : 'image/png';
            const screenshotBuffer = Buffer.from(scrapeResult.screenshot, 'base64');
            const saved = await fileStorage.importFromBuffer(
              screenshotBuffer,
              `screenshot_${resourceId}.${ext}`,
              'url'
            );

            const dataUrl = `data:${mime};base64,${scrapeResult.screenshot}`;
            queries.updateResourceThumbnail.run(dataUrl, Date.now(), resourceId);

            metadata.screenshot_path = saved.internalPath;

            // Release screenshot from memory ASAP to avoid OOM (don't broadcast thumbnail_data)
            scrapeResult.screenshot = null;
          }

          // Update title and content (broadcast without thumbnail_data - viewer will re-fetch)
          if (scrapeResult.title) {
            queries.updateResource.run(
              scrapeResult.title,
              resource.content,
              JSON.stringify(metadata),
              Date.now(),
              resourceId
            );
            broadcastResourceUpdated(resourceId, {
              title: scrapeResult.title,
              metadata,
              updated_at: Date.now(),
              thumbnail_ready: true,
            });
          }

          metadata.scraped_content = scrapeResult.content;
          metadata.metadata = scrapeResult.metadata;
        }
      }

      // Index full content as chunks for semantic search (via resource-indexer)
      if (scrapeResult?.content && initModule && ollamaService) {
        const indexerDeps = { database, initModule, ollamaService };
        resourceIndexer.scheduleIndexing(resourceId, indexerDeps);
      }

      // Update final status
      metadata.processing_status = 'completed';
      metadata.processed_at = Date.now();

      const currentResource = queries.getResourceById.get(resourceId);
      queries.updateResource.run(
        currentResource?.title ?? resource.title,
        resource.content,
        JSON.stringify(metadata),
        Date.now(),
        resourceId
      );
      // Broadcast without thumbnail_data to avoid OOM - viewers re-fetch when needed
      broadcastResourceUpdated(resourceId, {
        metadata,
        updated_at: Date.now(),
        thumbnail_ready: true,
      });

      return { success: true, metadata };
    } catch (error) {
      console.error('[Web] Error processing URL resource:', error);

      // Update status to failed
      try {
        const queries = database.getQueries();
        const resource = queries.getResourceById.get(resourceId);
        if (resource) {
          const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
          metadata.processing_status = 'failed';
          queries.updateResource.run(
            resource.title,
            resource.content,
            JSON.stringify(metadata),
            Date.now(),
            resourceId
          );
          broadcastResourceUpdated(resourceId, { metadata, updated_at: Date.now() });
        }
      } catch (updateError) {
        console.error('[Web] Error updating failed status:', updateError);
      }

      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
