/* eslint-disable no-console */
/**
 * Prompts and task helpers for cloud-llm (replaces gemma-tasks on-device).
 */
'use strict';

/**
 * @param {(o: {
 *   system?: string,
 *   user: string,
 *   imageDataUrls?: string[],
 *   json?: boolean,
 *   maxTokens?: number,
 *   task?: string,
 * }) => Promise<string>} generateText
 * @param {string} dataUrl
 * @param {number} pageNumber
 */
async function transcribePdfPage(generateText, dataUrl, pageNumber) {
  const user =
    `Esta es la página ${pageNumber} de un documento PDF (renderizada como imagen). ` +
    'Transcribe TODO el contenido visible a Markdown limpio: títulos (#/##), listas, tablas en Markdown, ' +
    'fórmulas en LaTeX entre $ si aplica, y describe brevemente figuras o diagramas (sin inventar datos). ' +
    'No incluyas comentarios HTML ni el marcador <!-- page -->. Responde solo con el Markdown del contenido.';
  return generateText({
    user,
    imageDataUrls: [dataUrl],
    maxTokens: 4096,
    task: 'pdf_transcribe',
  });
}

/**
 * @param {(o: import('./cloud-llm.service.cjs') extends infer _ ? any : never) => Promise<string>} generateText
 * @param {string} dataUrl
 */
async function runOcrOnImageDataUrl(generateText, dataUrl) {
  return generateText({
    user:
      'Transcribe todo el texto visible en la imagen. Preserva listas y tablas en Markdown. Responde solo con el texto transcrito.',
    imageDataUrls: [dataUrl],
    maxTokens: 1024,
    task: 'ocr',
  });
}

/**
 * @param {(o: any) => Promise<string>} generateText
 * @param {string} dataUrl
 */
async function runCaptionOnImageDataUrl(generateText, dataUrl) {
  return generateText({
    user: 'Describe la imagen en 2–3 frases: objetos, composición y cualquier texto visible literal.',
    imageDataUrls: [dataUrl],
    maxTokens: 256,
    task: 'caption',
  });
}

/**
 * @param {(o: any) => Promise<string>} generateText
 * @param {string} bodyText
 * @param {string | null} imageDataUrl
 */
async function runAutoMetadata(generateText, bodyText, imageDataUrl) {
  const instruction =
    'Devuelve SOLO un JSON con las claves: title (string <=60 chars), tags (array de <=5 strings), summary (string <=240 chars). Sin markdown.';
  if (imageDataUrl) {
    const raw = await generateText({
      system: instruction,
      user: 'Contenido visual arriba.',
      imageDataUrls: [imageDataUrl],
      json: true,
      maxTokens: 256,
      task: 'auto_metadata',
    });
    return parseJsonFromRaw(raw);
  }
  const raw = await generateText({
    system: instruction,
    user: `Contenido:\n${String(bodyText || '').slice(0, 8000)}`,
    json: true,
    maxTokens: 256,
    task: 'auto_metadata',
  });
  return parseJsonFromRaw(raw);
}

/**
 * @param {string} raw
 */
function parseJsonFromRaw(raw) {
  try {
    const m = String(raw).match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/**
 * @param {(o: any) => Promise<string>} generateText
 * @param {string} imageDataUrl
 * @param {string} intent
 */
async function runScreenUnderstand(generateText, imageDataUrl, intent) {
  const sys =
    'Eres un agente que interpreta capturas de UI. Devuelve JSON con keys: elements (array de {label, bbox:[x,y,w,h], type}), summary (string). ' +
    (intent ? `Intención: ${intent}` : '');
  return generateText({
    system: sys,
    user: 'Analiza la captura y responde solo JSON.',
    imageDataUrls: [imageDataUrl],
    json: true,
    maxTokens: 1024,
    task: 'screen_understand',
  });
}

module.exports = {
  transcribePdfPage,
  runOcrOnImageDataUrl,
  runCaptionOnImageDataUrl,
  runAutoMetadata,
  runScreenUnderstand,
};
