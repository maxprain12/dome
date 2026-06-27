'use strict';

const {
  getSectionBody,
} = require('./tool-prompt-loader.cjs');
const { DOME_LOAD_DOC_DESCRIPTION, DOME_LOAD_DOC_IDS } = require('../../shared/prompt-assembler/index.cjs');

module.exports = {
  getSectionBody,
  DOME_LOAD_DOC_DESCRIPTION,
  DOME_LOAD_DOC_IDS,
};
