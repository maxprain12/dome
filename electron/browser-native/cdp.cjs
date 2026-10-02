'use strict';
const { bounded } = require('./async.cjs');

async function command(contents, name, params = {}, signal) {
  if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
  if (name.startsWith('Input.')) await bounded(contents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }), signal);
  if (name === 'DOM.requestNode' || name === 'DOM.setFileInputFiles') await bounded(contents.debugger.sendCommand('DOM.getDocument', { depth: 0 }), signal);
  return bounded(contents.debugger.sendCommand(name, params), signal);
}
async function sendKeys(contents, keys, signal) {
  const parts = keys.replace(/^Primary\+/, process.platform === 'darwin' ? 'Meta+' : 'Control+').split('+');
  const key = parts.pop();
  const modifiers = parts.reduce((bits, name) => bits | ({ Alt: 1, Control: 2, Meta: 4, Shift: 8 }[name] || 0), 0);
  const codes = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Space: 32 };
  const code = codes[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
  if (!code) throw new Error('Unsupported key');
  await command(contents, 'Input.dispatchKeyEvent', { type: modifiers ? 'rawKeyDown' : 'keyDown', key, modifiers, windowsVirtualKeyCode: code,
    ...((modifiers & (2 | 4)) && key.toUpperCase() === 'A' ? { commands: ['selectAll'] } : {}),
    ...(key === 'Enter' ? { text: '\r' } : key.length === 1 && !modifiers ? { text: key } : {}) }, signal);
  await command(contents, 'Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers, windowsVirtualKeyCode: code }, signal);
  if ((modifiers & (2 | 4)) && key.toUpperCase() === 'A') await command(contents, 'Runtime.evaluate', { expression: 'document.activeElement?.select?.()' }, signal);
}
module.exports = { command, sendKeys };
