/* eslint-disable no-console */

function register({ ipcMain, windowManager, database, fileStorage, webScraper, youtubeService, ollamaService, initModule }) {
  function normalizeScrapeRequest(input) {
    if (typeof input === 'string') {
      return { url: input };
    }
    if (input && typeof input === 'object') {
      return input;
    }
    return { url: '' };
  }

  function broadcastResourceUpdated(resourceId, updates) {
    try {
      windowManager.broadcast('resource:updated', { id: resourceId, updates });
    } catch (e) {
      console.error('[Web] Error broadcasting resource:updated', e);
    }
  }

  function loadUrlResource(queries, resourceId) {
    const resource = queries.getResourceById.get(resourceId);
    if (!resource) {
      return { error: 'Resource not found' };
    }
    if (resource.type !== 'url') {
      return { error: 'Resource is not a URL type' };
    }
    const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
    const url = metadata.url || resource.content;
    if (!url) {
      return { error: 'URL not found in resource' };
    }
    return { resource, metadata, url };
  }

  function markResourceProcessing(queries, resourceId, resource, metadata) {
    metadata.processing_status = 'processing';
    const now = Date.now();
    queries.updateResource.run(
      resource.title,
      resource.content,
      JSON.stringify(metadata),
      now,
      resourceId
    );
    broadcastResourceUpdated(resourceId, { metadata, updated_at: now });
  }

  async function processYouTubeThumbnail({ queries, fileStorage, resourceId, url, metadata, youtubeService }) {
    const thumbnailResult = await youtubeService.getYouTubeThumbnail(url);
    if (!thumbnailResult.success || !thumbnailResult.thumbnail) {
      return;
    }

    queries.updateResourceThumbnail.run(thumbnailResult.thumbnail.dataUrl, Date.now(), resourceId);
    metadata.video_id = thumbnailResult.videoId;
  }

  async function saveScrapeScreenshot({ queries, resourceId, scrapeResult }) {
    const mime = scrapeResult.screenshotFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
    queries.updateResourceThumbnail.run(`data:${mime};base64,${scrapeResult.screenshot}`, Date.now(), resourceId);
    scrapeResult.screenshot = null;
  }

  function updateTitleFromScrape({ queries, resourceId, resource, scrapeResult, metadata }) {
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

  async function processArticleScrape({ queries, fileStorage, webScraper, resourceId, url, resource, metadata }) {
    const scrapeResult = await webScraper.scrapeUrl({
      url,
      includeScreenshot: true,
      includeMetadata: true,
      maxLength: 50000,
    });

    if (!scrapeResult.success) {
      const processingError = scrapeResult.error || 'Failed to scrape URL';
      metadata.scrape_error = processingError;
      metadata.scrape_warnings = Array.isArray(scrapeResult.warnings) ? scrapeResult.warnings : [];
      return { processingFailed: true, processingError };
    }

    if (scrapeResult.screenshot) {
      await saveScrapeScreenshot({ queries, fileStorage, resourceId, scrapeResult, metadata });
    }

    if (scrapeResult.title) {
      updateTitleFromScrape({ queries, resourceId, resource, scrapeResult, metadata });
    }

    metadata.scraped_content = scrapeResult.content;
    metadata.metadata = scrapeResult.metadata;
    metadata.final_url = scrapeResult.finalUrl || scrapeResult.url || url;
    metadata.scrape_warnings = Array.isArray(scrapeResult.warnings) ? scrapeResult.warnings : [];
    delete metadata.scrape_error;

    return { processingFailed: false, processingError: null };
  }

  function finalizeResourceProcessing({ queries, resourceId, resource, metadata, processingFailed, processingError }) {
    metadata.processing_status = processingFailed ? 'failed' : 'completed';
    metadata.processed_at = Date.now();

    const currentResource = queries.getResourceById.get(resourceId);
    const now = Date.now();
    queries.updateResource.run(
      currentResource?.title ?? resource.title,
      resource.content,
      JSON.stringify(metadata),
      now,
      resourceId
    );
    // Broadcast without thumbnail_data to avoid OOM - viewers re-fetch when needed
    broadcastResourceUpdated(resourceId, {
      metadata,
      updated_at: now,
      thumbnail_ready: true,
    });

    if (processingFailed) {
      return { success: false, error: processingError || 'Failed to process URL resource', metadata };
    }
    return { success: true, metadata };
  }

  function markResourceFailed(database, resourceId) {
    try {
      const queries = database.getQueries();
      const resource = queries.getResourceById.get(resourceId);
      if (resource) {
        const metadata = resource.metadata ? JSON.parse(resource.metadata) : {};
        metadata.processing_status = 'failed';
        const now = Date.now();
        queries.updateResource.run(
          resource.title,
          resource.content,
          JSON.stringify(metadata),
          now,
          resourceId
        );
        broadcastResourceUpdated(resourceId, { metadata, updated_at: now });
      }
    } catch (updateError) {
      console.error('[Web] Error updating failed status:', updateError);
    }
  }

  /**
   * Scrape a URL and extract content + screenshot
   */
  ipcMain.handle('web:scrape', async (event, input) => {
    if (!windowManager.isAuthorized(event.sender.id)) {
      return { success: false, error: 'Unauthorized' };
    }

    try {
      const request = normalizeScrapeRequest(input);
      const result = await webScraper.scrapeUrl(request);
      return result;
    } catch (error) {
      console.error('[Web] Error scraping URL:', error);
      const request = normalizeScrapeRequest(input);
      return { success: false, error: error.message, url: request.url };
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
  ipcMain.handle('web:save-screenshot', async (event, { resourceId, screenshotBase64 }) => {
    if (!windowManager.isAuthorized(event.sender.id)) return { success: false, error: 'Unauthorized' };
    if (typeof screenshotBase64 !== 'string' || !screenshotBase64) return { success: false, error: 'Screenshot required' };
    const queries = database.getQueries();
    if (!queries.getResourceById.get(resourceId)) return { success: false, error: 'Resource not found' };
    const thumbnailData = screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/png;base64,${screenshotBase64}`;
    queries.updateResourceThumbnail.run(thumbnailData, Date.now(), resourceId);
    broadcastResourceUpdated(resourceId, { thumbnail_data: thumbnailData });
    return { success: true, thumbnailData };
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
      const loaded = loadUrlResource(queries, resourceId);
      if (loaded.error) {
        return { success: false, error: loaded.error };
      }
      const { resource, metadata, url } = loaded;

      markResourceProcessing(queries, resourceId, resource, metadata);

      const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

      let processingFailed = false;
      let processingError = null;

      if (isYouTube) {
        await processYouTubeThumbnail({ queries, fileStorage, resourceId, url, metadata, youtubeService });
      } else {
        const result = await processArticleScrape({
          queries, fileStorage, webScraper, resourceId, url, resource, metadata,
        });
        processingFailed = result.processingFailed;
        processingError = result.processingError;
      }

      return finalizeResourceProcessing({
        queries, resourceId, resource, metadata, processingFailed, processingError,
      });
    } catch (error) {
      console.error('[Web] Error processing URL resource:', error);
      markResourceFailed(database, resourceId);
      return { success: false, error: error.message };
    }
  });
}

module.exports = { register };
