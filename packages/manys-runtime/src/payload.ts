import { shrinkOldToolResults } from './trim.js';

/** What one model request may carry as text (images are counted apart). The tools and instructions take about 14 KB; the rest is the conversation. */
export const TEXT_REQUEST_LIMIT = 98304;
/** The whole request, images included. */
export const TOTAL_REQUEST_LIMIT = 5242880;
const KEEP_IMAGES = 4;
const OMITTED_IMAGE = 'Earlier screenshot omitted. Take a fresh computer snapshot when needed.';

type Node = Record<string, unknown>;
const isNode = (value: unknown): value is Node => !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * An image inside a request, in whichever shape the API in use gives it:
 *  - OpenAI chat / Mistral: `{type:'image_url', image_url|imageUrl}`
 *  - OpenAI responses:       `{type:'input_image', image_url}`
 *  - Anthropic messages:     `{type:'image', source:{type:'base64', data}}`
 *  - Google:                 a part with `inlineData`
 * `replace` rewrites the node in place into a text part of the same API.
 */
interface ImageSlot { replace: () => void }

function imageSlots(payload: unknown): ImageSlot[] {
  const slots: ImageSlot[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!isNode(value)) return;
    const type = String(value.type ?? '');
    const text = (kind: string) => () => { for (const key of Object.keys(value)) delete value[key]; Object.assign(value, kind === 'part' ? { text: OMITTED_IMAGE } : { type: kind, text: OMITTED_IMAGE }); };
    if (type === 'image_url' || type === 'input_image') { slots.push({ replace: text(type === 'input_image' ? 'input_text' : 'text') }); return; }
    if (type === 'image' && isNode(value.source)) { slots.push({ replace: text('text') }); return; }
    if (isNode(value.inlineData) || isNode(value.inline_data)) { slots.push({ replace: text('part') }); return; }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return slots;
}

/** Picture bytes by where they sit: a data URL, an Anthropic base64 source, or a Google inline part. */
function isPictureData(holder: unknown, key: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.startsWith('data:image/')) return true;
  if (key !== 'data' || !isNode(holder)) return false;
  return holder.type === 'base64' || 'mimeType' in holder || 'mime_type' in holder;
}

/** The size of a request as text: pictures excluded, so a screenshot does not count against the text budget. */
export function textBytes(payload: unknown): number {
  const text = JSON.stringify(payload, function replacer(this: unknown, key: string, value: unknown) {
    return isPictureData(this, key, value) ? '[image]' : value;
  }) ?? '';
  return Buffer.byteLength(text);
}

export interface PayloadResult { shortenedResults: number; omittedImages: number }

/**
 * The last thing done to a request before it leaves. History stays whole in the session; here old pictures
 * and old large tool results are left out so a long task does not outgrow the model's budget, and a request
 * that is still too large fails here with a clear code instead of at the provider.
 */
export function prepareRequestPayload(payload: unknown, limits: { text?: number; total?: number; keepImages?: number } = {}): PayloadResult {
  const shortenedResults = shrinkOldToolResults(payload);
  const slots = imageSlots(payload);
  const old = slots.slice(0, Math.max(0, slots.length - (limits.keepImages ?? KEEP_IMAGES)));
  for (const slot of old) slot.replace();
  if (Buffer.byteLength(JSON.stringify(payload) ?? '') > (limits.total ?? TOTAL_REQUEST_LIMIT)) throw new Error('request_context_limit');
  if (textBytes(payload) > (limits.text ?? TEXT_REQUEST_LIMIT)) throw new Error('request_context_limit');
  return { shortenedResults, omittedImages: old.length };
}
