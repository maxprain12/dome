'use strict';

const { DEFAULT_PORT } = require('./protocol.cjs');
const { createPairing } = require('./pairing.cjs');
const { createCaptureService } = require('./capture-service.cjs');
const { createManyService } = require('./many-service.cjs');
const { createServer } = require('./server.cjs');

let runtime = null;

function getRuntime() {
  return runtime;
}

function start(deps = {}) {
  if (runtime?.server) {
    return Promise.resolve({
      success: true,
      port: runtime.server.getStatus().port,
      alreadyRunning: true,
    });
  }
  const database = deps.database || require('../core/database.cjs');
  const pairing = createPairing({ getQueries: () => database.getQueries() });
  const capture = createCaptureService({
    database,
    fileStorage: deps.fileStorage,
    windowManager: deps.windowManager,
  });
  const many = createManyService();
  const server = createServer({
    pairing,
    capture,
    many,
    port: deps.port || DEFAULT_PORT,
  });
  runtime = { pairing, capture, many, server, database };
  return server.listen();
}

function stop() {
  if (!runtime?.server) return Promise.resolve({ success: true });
  const handle = runtime.server.stop();
  runtime = null;
  return handle;
}

function getStatus() {
  if (!runtime?.server) {
    return { running: false, port: null, version: require('./protocol.cjs').PROTOCOL_VERSION };
  }
  return runtime.server.getStatus();
}

function getPairing() {
  return runtime?.pairing || null;
}

module.exports = { start, stop, getStatus, getPairing, getRuntime };
