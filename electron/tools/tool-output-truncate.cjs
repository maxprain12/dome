'use strict';

/**
 * Truncation for tool outputs (lines + bytes).
 * Mirrors packages/agent-core/src/harness/utils/truncate.ts for sync CJS handlers.
 */

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;
const GREP_MAX_LINE_LENGTH = 500;

function splitLinesForCounting(content) {
  if (content.length === 0) return [];
  const lines = content.split('\n');
  if (content.endsWith('\n')) lines.pop();
  return lines;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function truncateStringToBytesFromEnd(str, maxBytes) {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  let start = buf.length - maxBytes;
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start += 1;
  return buf.slice(start).toString('utf8');
}

function truncateHead(content, options = {}) {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const totalBytes = Buffer.byteLength(content, 'utf8');
  const lines = splitLinesForCounting(content);
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  const firstLineBytes = Buffer.byteLength(lines[0] || '', 'utf8');
  if (firstLineBytes > maxBytes) {
    return {
      content: '',
      truncated: true,
      truncatedBy: 'bytes',
      totalLines,
      totalBytes,
      outputLines: 0,
      outputBytes: 0,
      lastLinePartial: false,
      firstLineExceedsLimit: true,
      maxLines,
      maxBytes,
    };
  }

  const outputLinesArr = [];
  let outputBytesCount = 0;
  let truncatedBy = 'lines';

  for (let i = 0; i < lines.length && i < maxLines; i += 1) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, 'utf8') + (i > 0 ? 1 : 0);
    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      break;
    }
    outputLinesArr.push(line);
    outputBytesCount += lineBytes;
  }

  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = 'lines';
  }

  const outputContent = outputLinesArr.join('\n');
  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: Buffer.byteLength(outputContent, 'utf8'),
    lastLinePartial: false,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

function truncateTail(content, options = {}) {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const totalBytes = Buffer.byteLength(content, 'utf8');
  const lines = splitLinesForCounting(content);
  const totalLines = lines.length;

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
      lastLinePartial: false,
      firstLineExceedsLimit: false,
      maxLines,
      maxBytes,
    };
  }

  const outputLinesArr = [];
  let outputBytesCount = 0;
  let truncatedBy = 'lines';
  let lastLinePartial = false;

  for (let i = lines.length - 1; i >= 0 && outputLinesArr.length < maxLines; i -= 1) {
    const line = lines[i];
    const lineBytes = Buffer.byteLength(line, 'utf8') + (outputLinesArr.length > 0 ? 1 : 0);
    if (outputBytesCount + lineBytes > maxBytes) {
      truncatedBy = 'bytes';
      if (outputLinesArr.length === 0) {
        const truncatedLine = truncateStringToBytesFromEnd(line, maxBytes);
        outputLinesArr.unshift(truncatedLine);
        outputBytesCount = Buffer.byteLength(truncatedLine, 'utf8');
        lastLinePartial = true;
      }
      break;
    }
    outputLinesArr.unshift(line);
    outputBytesCount += lineBytes;
  }

  if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
    truncatedBy = 'lines';
  }

  const outputContent = outputLinesArr.join('\n');
  return {
    content: outputContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines: outputLinesArr.length,
    outputBytes: Buffer.byteLength(outputContent, 'utf8'),
    lastLinePartial,
    firstLineExceedsLimit: false,
    maxLines,
    maxBytes,
  };
}

function truncateLine(line, maxChars = GREP_MAX_LINE_LENGTH) {
  if (line.length <= maxChars) return { text: line, wasTruncated: false };
  return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true };
}

module.exports = {
  DEFAULT_MAX_LINES,
  DEFAULT_MAX_BYTES,
  GREP_MAX_LINE_LENGTH,
  formatSize,
  truncateHead,
  truncateTail,
  truncateLine,
};
