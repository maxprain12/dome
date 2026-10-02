const fetcher = require('../services/web/fetch-dispatcher.cjs');

module.exports = {
  scrapeUrl: fetcher.scrapeUrl,
  close: async () => {},
};
