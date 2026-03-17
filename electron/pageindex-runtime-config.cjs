const path = require('path');

const STANDALONE_PYTHON_VERSION = '3.12.9';
const STANDALONE_PYTHON_RELEASE = '20250317';
const RUNTIME_DIR_NAME = 'pageindex-runtime';
const DOME_FILES_DIR = 'dome-files';

function getRuntimeTargetId(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

function getStandaloneArchiveName(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin') {
    const normalizedArch = arch === 'arm64' ? 'aarch64' : 'x86_64';
    return `cpython-${STANDALONE_PYTHON_VERSION}+${STANDALONE_PYTHON_RELEASE}-${normalizedArch}-apple-darwin-install_only.tar.gz`;
  }
  if (platform === 'win32') {
    return `cpython-${STANDALONE_PYTHON_VERSION}+${STANDALONE_PYTHON_RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`;
  }
  return `cpython-${STANDALONE_PYTHON_VERSION}+${STANDALONE_PYTHON_RELEASE}-x86_64-unknown-linux-gnu-install_only.tar.gz`;
}

function getStandalonePythonUrl(platform = process.platform, arch = process.arch) {
  const archiveName = getStandaloneArchiveName(platform, arch);
  return `https://github.com/indygreg/python-build-standalone/releases/download/${STANDALONE_PYTHON_RELEASE}/${archiveName}`;
}

function getEmbeddedRuntimeRelativePath(platform = process.platform, arch = process.arch) {
  return path.join(RUNTIME_DIR_NAME, getRuntimeTargetId(platform, arch));
}

module.exports = {
  DOME_FILES_DIR,
  RUNTIME_DIR_NAME,
  STANDALONE_PYTHON_RELEASE,
  STANDALONE_PYTHON_VERSION,
  getEmbeddedRuntimeRelativePath,
  getRuntimeTargetId,
  getStandaloneArchiveName,
  getStandalonePythonUrl,
};
