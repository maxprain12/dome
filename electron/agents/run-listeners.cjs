'use strict';

const { EventEmitter } = require('node:events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

function subscribeRunEvents(listener) {
  bus.on('event', listener);
  return () => bus.off('event', listener);
}

function notifyRunEvent(channel, payload) {
  bus.emit('event', channel, payload);
}

module.exports = { subscribeRunEvents, notifyRunEvent };
