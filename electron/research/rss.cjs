
'use strict';
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { evidence } = require('./evidence.cjs');
const list = (value) => value == null ? [] : [value].flat();
const text = (value) => typeof value === 'object' ? String(value?.['#text'] || '') : String(value || '');
function parseFeed(xml, url, count = 30) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('unsafe_or_oversized_feed');
  if (XMLValidator.validate(xml) !== true) throw new Error('invalid_feed');
  const root = new XMLParser({ ignoreAttributes: false, processEntities: false }).parse(xml);
  const rows = root.feed?.entry || root.rss?.channel?.item;
  if (!rows) throw new Error('unsupported_feed');
  return list(rows).slice(0, count).flatMap((item) => {
    const link = typeof item.link === 'string' ? item.link : list(item.link).find((l) => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'];
    if (!link) return [];
    const date = Date.parse(text(item.pubDate || item.published || item.updated));
    return [evidence({ platform: 'rss', url: new URL(link, url).href, title: text(item.title),
      text: text(item['content:encoded'] || item.content || item.description || item.summary),
      publishedAt: date, method: 'rss_feed', limitations: ['partial_feed'] })];
  });
}
module.exports = { parseFeed };
