'use strict';

function abortError() {
  return Object.assign(new Error('Operation cancelled'), { name: 'AbortError', code: 'aborted' });
}

function bounded(promise, signal, timeoutMs = 30000, onStop = () => {}) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    const stop = (error) => { cleanup(); onStop(); reject(error); };
    const abort = () => stop(abortError());
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stop(Object.assign(new Error('Browser operation timed out'), { code: 'timeout' })), timeoutMs);
    Promise.resolve(promise).then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
  });
}

class Slots {
  constructor(limit = 2) { this.limit = limit; this.active = 0; this.queue = []; }
  acquire(signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const item = { signal, resolve, reject };
      item.abort = () => {
        this.queue = this.queue.filter((entry) => entry !== item);
        reject(abortError());
      };
      signal?.addEventListener('abort', item.abort, { once: true });
      this.queue.push(item);
      this.drain();
    });
  }
  drain() {
    while (this.active < this.limit && this.queue.length) {
      const item = this.queue.shift();
      item.signal?.removeEventListener('abort', item.abort);
      this.active++;
      let released = false;
      item.resolve(() => {
        if (released) return;
        released = true;
        this.active--;
        this.drain();
      });
    }
  }
}

module.exports = { abortError, bounded, Slots };
