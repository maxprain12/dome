'use strict';

/**
 * Normalize artifact HTML at write time (issue #465, H5).
 *
 * `state.html` / `template` must be a BODY FRAGMENT: the renderer wraps it in
 * its own document (theme styles + DOME_DATA bridge + boot scripts). When the
 * model emits a full document (`<!DOCTYPE html><html>…`), nesting it inside
 * that wrapper produces invalid HTML and loses <head> styles. This extracts
 * the body content and hoists head <style> blocks so nothing is lost.
 *
 * Keep in sync with the renderer copy in `app/lib/chat/artifactFrameUrl.ts`
 * (render-time defense for artifacts saved before this normalization existed).
 */

/** @param {string} html @returns {{ body: string, css: string, changed: boolean }} */
function normalizeArtifactHtml(html) {
  const input = String(html ?? '');
  if (!/<!doctype\s|<html[\s>]/i.test(input)) {
    return { body: input, css: '', changed: false };
  }

  // Hoist styles from the whole document (head styles would otherwise be lost).
  const headMatch = input.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : '';
  const css = [...headContent.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1].trim())
    .filter(Boolean)
    .join('\n\n');

  const bodyMatch = input.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  let body;
  if (bodyMatch) {
    body = bodyMatch[1].trim();
  } else {
    // Malformed document: strip the wrappers we know about and keep the rest.
    body = input
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim();
  }

  return { body, css, changed: true };
}

/**
 * Normalize a state object in place semantics: returns a NEW state whose
 * `html` is a body fragment and whose hoisted css is appended to `state.css`.
 * Returns the input untouched when nothing needs normalizing.
 * @param {unknown} state
 */
function normalizeArtifactState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const st = /** @type {Record<string, unknown>} */ (state);
  if (typeof st.html !== 'string') return state;
  const { body, css, changed } = normalizeArtifactHtml(st.html);
  if (!changed) return state;
  const prevCss = typeof st.css === 'string' ? st.css : '';
  return {
    ...st,
    html: body,
    css: css ? (prevCss ? `${prevCss}\n\n${css}` : css) : prevCss,
  };
}

module.exports = { normalizeArtifactHtml, normalizeArtifactState };
