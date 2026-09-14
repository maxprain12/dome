'use strict';
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function documentState(markdown) {
  const { marked, Renderer } = require('marked');
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  const originalLink = renderer.link.bind(renderer);
  renderer.link = (token) => /^(?:https?:|mailto:|#|\/|\.\.?\/)/i.test(token.href.trim()) ? originalLink(token) : escapeHtml(token.text);
  return {
    format: 'document',
    markdown,
    html: `<article class="dome-document">${marked.parse(markdown, { renderer, async: false })}</article>`,
    css: `.dome-document{max-width:78ch;margin:0 auto;padding:clamp(24px,5vw,64px);color:var(--foreground,var(--primary-text));font:15px/1.75 system-ui;overflow-wrap:anywhere}.dome-document h1{font-size:clamp(28px,4vw,42px);letter-spacing:-.035em;line-height:1.15;margin:0 0 32px}.dome-document h2{font-size:23px;letter-spacing:-.02em;margin:40px 0 14px;border-bottom:1px solid var(--border);padding-bottom:12px}.dome-document h3{font-size:17px;margin:28px 0 10px}.dome-document p,.dome-document ul,.dome-document ol{margin:14px 0}.dome-document ul,.dome-document ol{padding-left:24px}.dome-document blockquote{border-left:3px solid var(--primary,var(--accent));margin:24px 0;padding:4px 20px;color:var(--muted-foreground,var(--secondary-text))}.dome-document table{display:block;overflow:auto;border-collapse:collapse;width:100%;font-size:13px}.dome-document th,.dome-document td{padding:12px;border-bottom:1px solid var(--border);text-align:left}.dome-document th{font-weight:600;background:var(--muted,var(--bg-secondary))}.dome-document pre{padding:18px;background:var(--muted,var(--bg-secondary));border-radius:8px;overflow:auto}.dome-document a{color:var(--primary,var(--accent));text-underline-offset:3px}.dome-document img{max-width:100%;height:auto}`,
  };
}

module.exports = { documentState };
