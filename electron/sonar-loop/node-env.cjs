'use strict';
/**
 * Headless Node bootstrap for sonar-loop (CI/Coolify without Electron binary or root).
 * Mocks `require('electron')` before database/tools load.
 */
const path = require('path');
const os = require('os');
const Module = require('module');

/** @param {string} userData */
function installElectronMock(userData) {
  const electronStub = {
    app: {
      getPath(name) {
        switch (name) {
          case 'userData':
            return userData;
          case 'home':
            return os.homedir();
          case 'temp':
            return os.tmpdir();
          case 'appData':
          case 'userCache':
          case 'logs':
            return userData;
          default:
            return userData;
        }
      },
      setPath() {},
      whenReady: () => Promise.resolve(),
      exit(code) {
        process.exit(typeof code === 'number' ? code : 0);
      },
      disableHardwareAcceleration() {},
      commandLine: { appendSwitch() {} },
      isReady: () => true,
    },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: '' }),
      showMessageBox: async () => ({ response: 0 }),
    },
    ipcMain: { handle() {}, on() {} },
    BrowserWindow: class BrowserWindow {},
  };

  const originalLoad = Module._load;
  Module._load = function loadWithElectronMock(request, parent, isMain) {
    if (request === 'electron') {
      return electronStub;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

/** @returns {string} userData path */
function bootstrapSonarLoopNodeEnv() {
  const { loadDotenv } = require('../bench/load-env.cjs');
  loadDotenv();

  const userData =
    process.env.DOME_SONAR_LOOP_USER_DATA || path.join(os.homedir(), '.dome-sonar-loop');
  process.env.DOME_SONAR_LOOP_USER_DATA = userData;
  process.env.DOME_BENCH = '1';

  installElectronMock(userData);
  return userData;
}

module.exports = { bootstrapSonarLoopNodeEnv, installElectronMock };
