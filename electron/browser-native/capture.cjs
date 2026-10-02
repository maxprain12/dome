'use strict';
const { command } = require('./cdp.cjs');

// CDP captures the renderer surface without requiring a native window parent.
// Electron capturePage can wait indefinitely for unattached views on Linux.
async function capture(contents, signal) {
  const { data } = await command(contents, 'Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  }, signal);
  if (!data) throw new Error('Browser screenshot is unavailable');
  return {
    toDataURL: () => `data:image/png;base64,${data}`,
    toPNG: () => Buffer.from(data, 'base64'),
  };
}
module.exports = { capture };
