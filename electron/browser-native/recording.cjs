'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { bounded } = require('./async.cjs');
const { command } = require('./cdp.cjs');

async function startRecording(browser, item, directory) {
  if (item.options.record === 'off' && !item.options.recordHar && !item.options.traces) return;
  if (!directory) throw new Error('Recording requires an authorized output directory');
  await fs.mkdir(directory, { recursive: true });
  const recording = { directory, frames: 0, bytes: 0, expires: Date.now() + 60000, events: [], stopped: false, outputs: [], contents: new Set() };
  item.recording = recording;
  async function tick() {
    if (recording.stopped || recording.frames >= 1800 || recording.bytes >= 512000000 || Date.now() >= recording.expires) return;
    try {
      const contents = browser.tab(item).view.webContents;
      if (item.busy || !/^https?:/.test(contents.getURL())) { recording.timer = setTimeout(tick, 100); return; }
      if ((item.options.recordHar || item.options.traces) && !recording.contents.has(contents)) {
        await command(contents, 'Network.enable');
        contents.debugger.on('message', recording.onMessage);
        recording.contents.add(contents);
      }
      if (item.options.record !== 'off' && !item.hasSecrets) {
        const image = await bounded(contents.capturePage(), undefined, 5000);
        const bytes = image.toPNG();
        recording.bytes += bytes.length;
        await fs.writeFile(path.join(directory, `${String(recording.frames).padStart(6, '0')}.png`), bytes);
      }
      if (item.options.record === 'off' || !item.hasSecrets) recording.frames++;
    } catch { /* A closed tab must not stop its owning agent. */ }
    if (!recording.stopped) recording.timer = setTimeout(tick, 1000 / item.options.recordFps);
  }
  recording.onMessage = (_event, method, params) => {
    if (!method.startsWith('Network.') || recording.events.length >= 10000) return;
    // Never record cookies, auth headers, request bodies or query tokens.
    const request = params.request;
    const response = params.response;
    const url = request?.url || response?.url;
    let safeUrl;
    try { const parsed = new URL(url); parsed.search = ''; parsed.hash = ''; parsed.username = ''; parsed.password = ''; safeUrl = parsed.toString(); } catch { return; }
    recording.events.push({ method, wallTime: params.wallTime, requestId: params.requestId, timestamp: params.timestamp, url: safeUrl,
      requestMethod: request?.method, status: response?.status, mimeType: response?.mimeType });
  };
  recording.attach = async contents => {
    if ((!item.options.recordHar && !item.options.traces) || recording.contents.has(contents)) return;
    await command(contents, 'Network.enable');
    contents.debugger.on('message', recording.onMessage);
    recording.contents.add(contents);
  };
  await recording.attach(browser.tab(item).view.webContents);
  recording.tick = tick;
  await tick();
}

async function finishRecording(item) {
  const recording = item.recording;
  if (!recording) return [];
  if (recording.frames === 0 && item.options.record !== 'off') await recording.tick();
  recording.stopped = true;
  clearTimeout(recording.timer);
  for (const contents of recording.contents) contents.debugger.removeListener('message', recording.onMessage);
  if (item.options.traces) {
    const target = path.join(recording.directory, 'trace.json');
    await fs.writeFile(target, JSON.stringify(recording.events)); recording.outputs.push(target);
  }
  if (item.options.recordHar) {
    const target = path.join(recording.directory, 'network.har');
    const entries = recording.events.filter((event) => event.method === 'Network.responseReceived').map((event) => ({
      startedDateTime: new Date((recording.events.find(request => request.requestId === event.requestId && request.wallTime)?.wallTime || Date.now() / 1000) * 1000).toISOString(), time: 0,
      request: { method: recording.events.find(request => request.requestId === event.requestId && request.requestMethod)?.requestMethod || 'GET', url: event.url, httpVersion: '', cookies: [], headers: [], queryString: [], headersSize: -1, bodySize: -1 },
      response: { status: event.status, statusText: '', httpVersion: '', cookies: [], headers: [], content: { size: 0, mimeType: event.mimeType || '' }, redirectURL: '', headersSize: -1, bodySize: -1 },
      cache: {}, timings: { send: 0, wait: 0, receive: 0 },
    }));
    await fs.writeFile(target, JSON.stringify({ log: { version: '1.2', creator: { name: 'Dome', version: '1' }, entries } })); recording.outputs.push(target);
  }
  if (item.options.record !== 'off' && recording.frames) {
    const paths = require('../media/ffmpeg-paths.cjs').getFfmpegInstallerPaths();
    if (!paths) throw new Error('Packaged FFmpeg is unavailable');
    const target = path.join(recording.directory, `browser.${item.options.record}`);
    const process = spawn(paths.ffmpegPath, ['-y', '-framerate', String(item.options.recordFps), '-i', path.join(recording.directory, '%06d.png'),
      ...(item.options.record === 'mp4' ? ['-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-pix_fmt', 'yuv420p'] : []), target], { stdio: ['ignore', 'ignore', 'pipe'] });
    await bounded(new Promise((resolve, reject) => { process.on('error', reject); process.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Browser recording encoding failed'))); }), undefined, 60000, () => process.kill());
    recording.outputs.push(target);
    for (let index = 0; index < recording.frames; index++) await fs.unlink(path.join(recording.directory, `${String(index).padStart(6, '0')}.png`)).catch(() => {});
  }
  item.recording = null;
  return recording.outputs;
}
module.exports = { startRecording, finishRecording };
