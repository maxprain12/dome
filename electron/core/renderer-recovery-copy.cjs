'use strict';
const path = require('node:path');
const { getAppRoot } = require('../paths.cjs');

// The canonical shell locale files are also packaged for native recovery UI.
function recoveryCopy(locale) {
  const language = String(locale).split('-')[0];
  const supported = ['en', 'es', 'fr', 'pt'].includes(language) ? language : 'en';
  return require(path.join(getAppRoot(), 'packages/i18n/locales', supported, 'shell.json')).renderer_recovery;
}
module.exports = { recoveryCopy };
