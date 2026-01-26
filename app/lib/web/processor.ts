/**
 * Web Processing Client - Renderer Process
 * Wrapper for IPC calls to process web resources
 */

/**
 * Check if a URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('youtube.com') || urlObj.hostname === 'youtu.be';
  } catch {
    return false;
  }
}

/**
 * Scrape a URL and extract content
 */
export async function scrapeUrl(url: string) {
  if (!window.electron?.web?.scrape) {
    throw new Error('Web scraping API not available');
  }

  return await window.electron.web.scrape(url);
}

/**
 * Get YouTube thumbnail
 */
export async function getYouTubeThumbnail(url: string) {
  if (!window.electron?.web?.getYouTubeThumbnail) {
    throw new Error('YouTube API not available');
  }

  return await window.electron.web.getYouTubeThumbnail(url);
}

/**
 * Process a URL resource completely
 * This includes scraping, screenshot/thumbnail, embeddings, and summary
 */
export async function processUrlResource(resourceId: string) {
  if (!window.electron?.web?.process) {
    throw new Error('Web processing API not available');
  }

  return await window.electron.web.process(resourceId);
}

/**
 * Check if Ollama is available
 */
export async function checkOllamaAvailability(): Promise<boolean> {
  if (!window.electron?.ollama?.checkAvailability) {
    return false;
  }

  try {
    const result = await window.electron.ollama.checkAvailability();
    return result?.success && result?.available === true;
  } catch (error) {
    console.error('Error checking Ollama availability:', error);
    return false;
  }
}

/**
 * Generate embedding with Ollama
 */
export async function generateEmbedding(text: string) {
  if (!window.electron?.ollama?.generateEmbedding) {
    throw new Error('Ollama API not available');
  }

  const result = await window.electron.ollama.generateEmbedding(text);
  if (!result.success) {
    throw new Error(result.error || 'Failed to generate embedding');
  }

  return result.embedding;
}

/**
 * Generate summary with Ollama
 */
export async function generateSummary(text: string) {
  if (!window.electron?.ollama?.generateSummary) {
    throw new Error('Ollama API not available');
  }

  const result = await window.electron.ollama.generateSummary(text);
  if (!result.success) {
    throw new Error(result.error || 'Failed to generate summary');
  }

  return result.summary;
}
