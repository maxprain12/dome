const search = require('../services/web/search-dispatcher.cjs');
const fetcher = require('../services/web/fetch-dispatcher.cjs');

module.exports = {
  scrapeUrl: fetcher.scrapeUrl,
  searchWeb: search.searchWeb,
  close: async () => {},
};
