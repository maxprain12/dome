/* eslint-disable no-console */
/**
 * TTS Service - Main Process
 *
 * Handles text-to-speech generation via the OpenAI TTS API.
 * Generates individual speech segments and can concatenate them
 * for multi-speaker podcast-style audio.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// Default voice assignments for podcast hosts
const HOST_VOICES = {
  'Host 1': 'nova',
  'Host 2': 'echo',
};

class TTSService {
  constructor() {
    this.audioDir = null; // Initialized lazily (app might not be ready)
    this._generationStatus = new Map(); // Track generation status by ID
  }

  /**
   * Ensure audio directory exists
   */
  _ensureAudioDir() {
    if (!this.audioDir) {
      this.audioDir = path.join(app.getPath('userData'), 'audio');
    }
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true });
    }
    return this.audioDir;
  }

  /**
   * Generate speech from text using OpenAI TTS API
   * @param {string} text - Text to convert to speech
   * @param {string} voice - Voice name (alloy, echo, fable, onyx, nova, shimmer)
   * @param {string} apiKey - OpenAI API key
   * @param {Object} options - Additional options
   * @param {string} [options.model='tts-1'] - TTS model (tts-1 or tts-1-hd)
   * @param {string} [options.response_format='mp3'] - Audio format
   * @param {number} [options.speed=1] - Speed (0.25 to 4.0)
   * @returns {Promise<{ success: boolean, audioPath?: string, error?: string }>}
   */
  async generateSpeech(text, voice = 'nova', apiKey, options = {}) {
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key is required for TTS' };
    }

    if (!text || !text.trim()) {
      return { success: false, error: 'Text is required' };
    }

    const model = options.model || 'tts-1';
    const responseFormat = options.response_format || 'mp3';
    const speed = options.speed || 1;

    try {
      const audioDir = this._ensureAudioDir();
      const filename = `tts_${crypto.randomUUID()}.${responseFormat}`;
      const audioPath = path.join(audioDir, filename);

      const audioBuffer = await this._callOpenAITTS({
        model,
        voice,
        input: text,
        response_format: responseFormat,
        speed,
      }, apiKey);

      fs.writeFileSync(audioPath, audioBuffer);

      console.log(`[TTS] Speech generated: ${audioPath} (${audioBuffer.length} bytes)`);

      return {
        success: true,
        audioPath,
        size: audioBuffer.length,
      };
    } catch (error) {
      console.error('[TTS] generateSpeech error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a full podcast from dialogue lines
   * Each line is synthesized with alternating voices and concatenated.
   *
   * @param {Array<{ speaker: string, text: string }>} lines - Dialogue lines
   * @param {string} apiKey - OpenAI API key
   * @param {Object} options - Additional options
   * @param {string} [options.model='tts-1'] - TTS model
   * @param {Object} [options.voices] - Custom voice mapping { 'Host 1': 'nova', 'Host 2': 'echo' }
   * @param {Function} [options.onProgress] - Progress callback (current, total)
   * @returns {Promise<{ success: boolean, audioPath?: string, segmentPaths?: string[], duration?: number, error?: string }>}
   */
  async generatePodcast(lines, apiKey, options = {}) {
    if (!apiKey) {
      return { success: false, error: 'OpenAI API key is required for TTS' };
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return { success: false, error: 'At least one dialogue line is required' };
    }

    const generationId = crypto.randomUUID();
    this._generationStatus.set(generationId, {
      status: 'generating',
      progress: 0,
      total: lines.length,
    });

    try {
      const audioDir = this._ensureAudioDir();
      const model = options.model || 'tts-1';
      const voiceMap = { ...HOST_VOICES, ...(options.voices || {}) };

      const segmentPaths = [];
      let cumulativeTime = 0;
      const linesWithTiming = [];

      // Generate speech for each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const voice = voiceMap[line.speaker] || 'nova';

        // Update progress
        this._generationStatus.set(generationId, {
          status: 'generating',
          progress: i,
          total: lines.length,
        });

        if (options.onProgress) {
          options.onProgress(i, lines.length);
        }

        const segmentFilename = `podcast_${generationId}_seg${i.toString().padStart(3, '0')}.mp3`;
        const segmentPath = path.join(audioDir, segmentFilename);

        const audioBuffer = await this._callOpenAITTS({
          model,
          voice,
          input: line.text,
          response_format: 'mp3',
          speed: 1,
        }, apiKey);

        fs.writeFileSync(segmentPath, audioBuffer);
        segmentPaths.push(segmentPath);

        // Estimate duration from buffer size (MP3 at ~128kbps)
        const estimatedDuration = (audioBuffer.length * 8) / (128 * 1000);
        linesWithTiming.push({
          ...line,
          startTime: Math.round(cumulativeTime * 100) / 100,
        });
        cumulativeTime += estimatedDuration;

        console.log(`[TTS] Segment ${i + 1}/${lines.length} generated: ${voice} (${audioBuffer.length} bytes, ~${estimatedDuration.toFixed(1)}s)`);
      }

      // Concatenate all MP3 segments into a single file
      const finalFilename = `podcast_${generationId}.mp3`;
      const finalPath = path.join(audioDir, finalFilename);

      const outputStream = fs.createWriteStream(finalPath);
      for (const segPath of segmentPaths) {
        const data = fs.readFileSync(segPath);
        outputStream.write(data);
      }
      outputStream.end();

      // Wait for write to complete
      await new Promise((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });

      // Clean up individual segments
      for (const segPath of segmentPaths) {
        try {
          fs.unlinkSync(segPath);
        } catch {
          // Ignore cleanup errors
        }
      }

      const finalStats = fs.statSync(finalPath);

      this._generationStatus.set(generationId, {
        status: 'completed',
        progress: lines.length,
        total: lines.length,
      });

      console.log(`[TTS] Podcast generated: ${finalPath} (${finalStats.size} bytes, ~${cumulativeTime.toFixed(1)}s)`);

      return {
        success: true,
        audioPath: finalPath,
        duration: Math.round(cumulativeTime),
        transcript: linesWithTiming,
        generationId,
      };
    } catch (error) {
      console.error('[TTS] generatePodcast error:', error);
      this._generationStatus.set(generationId, {
        status: 'error',
        error: error.message,
      });
      return { success: false, error: error.message, generationId };
    }
  }

  /**
   * Get generation status
   * @param {string} generationId
   * @returns {{ status: string, progress?: number, total?: number, error?: string } | null}
   */
  getStatus(generationId) {
    return this._generationStatus.get(generationId) || null;
  }

  /**
   * List generated audio files
   * @returns {Array<{ filename: string, path: string, size: number, created: number }>}
   */
  listAudioFiles() {
    try {
      const audioDir = this._ensureAudioDir();
      const files = fs.readdirSync(audioDir);

      return files
        .filter((f) => f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.opus'))
        .map((f) => {
          const fullPath = path.join(audioDir, f);
          const stats = fs.statSync(fullPath);
          return {
            filename: f,
            path: fullPath,
            size: stats.size,
            created: stats.birthtimeMs,
          };
        })
        .sort((a, b) => b.created - a.created);
    } catch (error) {
      console.error('[TTS] listAudioFiles error:', error);
      return [];
    }
  }

  /**
   * Call OpenAI TTS API
   * @private
   * @param {Object} body - Request body
   * @param {string} apiKey - OpenAI API key
   * @returns {Promise<Buffer>}
   */
  _callOpenAITTS(body, apiKey) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);

      const options = {
        hostname: 'api.openai.com',
        port: 443,
        path: '/v1/audio/speech',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        const chunks = [];

        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(chunks);

          if (res.statusCode !== 200) {
            let errorMessage = `OpenAI TTS API error (${res.statusCode})`;
            try {
              const errorBody = JSON.parse(buffer.toString());
              errorMessage = errorBody.error?.message || errorMessage;
            } catch {
              // Could not parse error body
            }
            reject(new Error(errorMessage));
            return;
          }

          resolve(buffer);
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Network error calling OpenAI TTS: ${error.message}`));
      });

      req.write(postData);
      req.end();
    });
  }
}

module.exports = new TTSService();
