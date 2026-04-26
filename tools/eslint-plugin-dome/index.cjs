'use strict';

module.exports = {
  rules: {
    'no-renderer-node-imports': require('./rules/no-renderer-node-imports.cjs'),
  },
  configs: {
    recommended: {
      plugins: ['dome'],
      rules: {
        'dome/no-renderer-node-imports': 'error',
      },
    },
  },
};
