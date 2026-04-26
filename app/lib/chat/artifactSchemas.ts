/**
 * Zod schemas for ```artifact:TYPE``` JSON payloads.
 * Used to validate model output before rendering; on failure ChatMessage falls back to code.
 */
import { z } from 'zod';

const nonEmptyString = z.string().min(1);

/** Allow only safe arithmetic / identifier characters in calculator formulas */
export function isSafeCalculatorFormula(formula: string): boolean {
  if (formula.length > 500) return false;
  return /^[0-9a-zA-Z_+\-*/().,\s]+$/.test(formula) && !/\b(?:constructor|prototype|__)\b/.test(formula);
}

const calcInputSchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  kind: z.enum(['slider', 'number', 'select']),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  value: z.number(),
  unit: z.string().optional(),
  options: z.array(z.object({ value: z.number(), label: z.string() })).optional(),
});

const calcOutputSchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  formula: z.string(),
  unit: z.string().optional(),
  format: z.enum(['plain', 'currency', 'percent', 'number']).optional(),
});

export const calculatorArtifactSchema = z.object({
  type: z.literal('calculator'),
  title: z.string().optional(),
  inputs: z.array(calcInputSchema),
  outputs: z.array(calcOutputSchema),
});

const diagramNodeSchema = z.object({
  id: nonEmptyString,
  label: z.string(),
  lane: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});

const diagramEdgeSchema = z.object({
  from: nonEmptyString,
  to: nonEmptyString,
  label: z.string().optional(),
});

export const diagramArtifactSchema = z.object({
  type: z.literal('diagram'),
  title: z.string().optional(),
  layout: z.enum(['horizontal', 'vertical', 'free']).optional(),
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
});

export const tabContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('code'), language: z.string(), code: z.string() }),
  z.object({ type: z.literal('list'), items: z.array(z.string()), ordered: z.boolean().optional() }),
  z.object({ type: z.literal('table'), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('placeholder'), message: z.string() }),
]);

export type TabContent = z.infer<typeof tabContentSchema>;

const tabItemSchema = z.object({
  id: nonEmptyString,
  label: z.string(),
  badge: z.string().optional(),
  content: tabContentSchema,
});

export const tabsArtifactSchema = z.object({
  type: z.literal('tabs'),
  title: z.string().optional(),
  tabs: z.array(tabItemSchema).min(1),
});

const playgroundExerciseSchema = z.object({
  id: nonEmptyString,
  title: z.string().optional(),
  prompt: z.string(),
  hint: z.string().optional(),
  solution: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const playgroundArtifactSchema = z.object({
  type: z.literal('playground'),
  title: z.string().optional(),
  theme: z.string().optional(),
  exercises: z.array(playgroundExerciseSchema).min(1),
});

const kpiSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  // Models routinely emit numeric KPI values (`"value": 5`) even when the
  // prompt says string. Coerce so a single numeric value doesn't kill the
  // whole dashboard — the renderer always treats it as text anyway.
  value: z.union([z.string(), z.number()]).transform((v) => String(v)),
  sub: z.string().optional(),
  // `unit` + `subtitle` aren't in the original schema but every model that
  // sees "KPI" emits them. Accept them officially so the renderer can show
  // them as a unit suffix and a subtitle line.
  unit: z.string().optional(),
  subtitle: z.string().optional(),
  trend: z.enum(['up', 'down', 'flat']).optional(),
});

const dashboardSectionSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  body: z.string(),
});

const mapCellSchema = z.object({
  r: z.number().int().nonnegative(),
  c: z.number().int().nonnegative(),
  label: z.string(),
  tone: z.enum(['neutral', 'good', 'warn', 'bad']).optional(),
});

const dashListItemSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  progress: z.number().min(0).max(100),
});

export const dashboardArtifactSchema = z.object({
  type: z.literal('dashboard'),
  title: z.string().optional(),
  kpis: z.array(kpiSchema).optional(),
  map: z
    .object({
      rows: z.number().int().positive(),
      cols: z.number().int().positive(),
      cells: z.array(mapCellSchema),
    })
    .optional(),
  items: z.array(dashListItemSchema).optional(),
  // Free-form "section cards" with title + markdown body. Models reach for
  // this shape when summarising a long document into a dashboard, so accept
  // and render them instead of falling back to raw JSON.
  sections: z.array(dashboardSectionSchema).optional(),
});

const timelineEventSchema = z.object({
  id: nonEmptyString,
  at: z.string(),
  title: z.string(),
  body: z.string().optional(),
  status: z.string().optional(),
});

export const timelineArtifactSchema = z.object({
  type: z.literal('timeline'),
  title: z.string().optional(),
  events: z.array(timelineEventSchema).min(1),
});

export const htmlArtifactSchema = z.object({
  type: z.literal('html'),
  title: z.string().optional(),
  html: z.string(),
  css: z.string().optional(),
  js: z.string().optional(),
  height: z.number().positive().optional(),
});

export type CalculatorArtifactV = z.infer<typeof calculatorArtifactSchema>;
export type DiagramArtifactV = z.infer<typeof diagramArtifactSchema>;
export type TabsArtifactV = z.infer<typeof tabsArtifactSchema>;
export type PlaygroundArtifactV = z.infer<typeof playgroundArtifactSchema>;
export type DashboardArtifactV = z.infer<typeof dashboardArtifactSchema>;
export type TimelineArtifactV = z.infer<typeof timelineArtifactSchema>;
export type HtmlArtifactV = z.infer<typeof htmlArtifactSchema>;

export function tryParseArtifact(type: string, data: unknown): { ok: true; value: unknown } | { ok: false } {
  const parsers: Record<string, z.ZodType<unknown>> = {
    calculator: calculatorArtifactSchema,
    diagram: diagramArtifactSchema,
    tabs: tabsArtifactSchema,
    playground: playgroundArtifactSchema,
    dashboard: dashboardArtifactSchema,
    timeline: timelineArtifactSchema,
    html: htmlArtifactSchema,
  };
  const schema = parsers[type];
  if (!schema) return { ok: false };
  const r = schema.safeParse(data);
  if (!r.success) return { ok: false };
  return { ok: true, value: r.data };
}

/** Artifact types that are fully specified by Zod schemas in this file. */
export const ZOD_VALIDATED_ARTIFACT_TYPES = new Set<string>([
  'calculator',
  'diagram',
  'tabs',
  'playground',
  'dashboard',
  'timeline',
  'html',
]);

/**
 * All artifact type strings understood by the UI (Zod-validated + legacy).
 * Used by the lenient recovery pass to rescue artifacts that were emitted as
 * plain ```json / ``` fences instead of the prescribed ```artifact:TYPE``` form.
 */
export const KNOWN_ARTIFACT_TYPES = new Set<string>([
  ...ZOD_VALIDATED_ARTIFACT_TYPES,
  'pdf_summary',
  'table',
  'action_items',
  'chart',
  'code',
  'list',
  'created_entity',
  'docling_images',
]);

/**
 * Robust artifact-block parser used by every renderer (ChatMessage,
 * ArtifactTabView, tool cards…).
 *
 * Accepts both `\n` and `\r\n` line endings, and produces structured
 * segments so consumers can:
 *  - render `text` prose as Markdown,
 *  - render `artifact` payloads via `ArtifactCard`,
 *  - show an explicit `invalid` placeholder when JSON / Zod parsing fails
 *    (instead of silently swallowing the block), and
 *  - show a `streaming` placeholder when a fence is still open in the middle
 *    of a live response.
 */
export type ParsedArtifactSegment =
  | { kind: 'text'; content: string }
  | { kind: 'artifact'; artifactType: string; value: Record<string, unknown> }
  | { kind: 'invalid'; artifactType: string; raw: string; reason: string }
  | { kind: 'streaming'; artifactType: string; raw: string };

export interface ParseArtifactBlocksOptions {
  /** When true, an unclosed `artifact:TYPE` fence at end-of-string is reported as a streaming segment. */
  allowStreaming?: boolean;
}

const ARTIFACT_BLOCK_REGEX = /```artifact:([\w-]+)\s*\r?\n([\s\S]*?)```/g;
const UNCLOSED_ARTIFACT_REGEX = /```artifact:([\w-]+)\s*\r?\n([\s\S]*)$/;
/**
 * Lenient recovery regex: plain ```json (or nothing) fences whose body MIGHT
 * be a serialized artifact object. We only promote the block when the parsed
 * JSON has a `type` field included in KNOWN_ARTIFACT_TYPES.
 */
const LENIENT_JSON_FENCE_REGEX = /```(?:json|jsonc|json5)?\s*\r?\n([\s\S]*?)```/g;
/**
 * Unclosed plain fence (```json | ```jsonc | ```json5 | ```) at end-of-string.
 * Used during streaming and as a last-resort recovery when the model forgets
 * to close the fence.
 */
const LENIENT_UNCLOSED_JSON_FENCE_REGEX = /```(?:json|jsonc|json5)?\s*\r?\n([\s\S]*)$/;
/** Cheap extractor for a top-level `"type": "<name>"` inside a partial JSON. */
const TYPE_FIELD_PROBE_REGEX = /"type"\s*:\s*"([\w-]+)"/;

function recoverArtifactsFromPlainFences(
  text: string,
  allowStreaming: boolean,
): ParsedArtifactSegment[] {
  if (!text.includes('```')) return [{ kind: 'text', content: text }];

  const segments: ParsedArtifactSegment[] = [];
  const regex = new RegExp(LENIENT_JSON_FENCE_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const body = (match[1] ?? '').trim();
    if (!body.startsWith('{') || !body.endsWith('}')) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }

    const candidate = parsed as { type?: unknown };
    const artifactType = typeof candidate?.type === 'string' ? candidate.type : '';
    if (!artifactType || !KNOWN_ARTIFACT_TYPES.has(artifactType)) continue;

    const textBefore = text.slice(lastIndex, match.index);
    if (textBefore.trim().length > 0) {
      segments.push({ kind: 'text', content: textBefore });
    }

    if (ZOD_VALIDATED_ARTIFACT_TYPES.has(artifactType)) {
      const validated = tryParseArtifact(artifactType, parsed);
      if (validated.ok) {
        segments.push({
          kind: 'artifact',
          artifactType,
          value: validated.value as Record<string, unknown>,
        });
      } else {
        segments.push({ kind: 'text', content: match[0] });
      }
    } else {
      segments.push({
        kind: 'artifact',
        artifactType,
        value: parsed as Record<string, unknown>,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  const remainder = text.slice(lastIndex);
  if (remainder.length > 0) {
    // Attempt to recover an unclosed trailing plain fence whose body looks
    // like a serialized artifact. This fires both while the response is still
    // streaming and as a last-resort fallback when the model forgets the
    // closing ``` — in both cases we'd otherwise render raw JSON to the user.
    const unclosed = LENIENT_UNCLOSED_JSON_FENCE_REGEX.exec(remainder);
    const rawBody = unclosed?.[1]?.trim() ?? '';
    const typeMatch = rawBody ? TYPE_FIELD_PROBE_REGEX.exec(rawBody) : null;
    const candidateType = typeMatch?.[1];

    if (unclosed && rawBody.startsWith('{') && candidateType && KNOWN_ARTIFACT_TYPES.has(candidateType)) {
      const textBeforeFence = remainder.slice(0, unclosed.index);
      if (textBeforeFence.trim().length > 0) {
        segments.push({ kind: 'text', content: textBeforeFence });
      }

      if (allowStreaming) {
        segments.push({ kind: 'streaming', artifactType: candidateType, raw: rawBody });
      } else if (rawBody.endsWith('}')) {
        // Closed-looking body but no trailing ``` — try to parse and promote.
        try {
          const parsed = JSON.parse(rawBody) as Record<string, unknown>;
          if (ZOD_VALIDATED_ARTIFACT_TYPES.has(candidateType)) {
            const validated = tryParseArtifact(candidateType, parsed);
            if (validated.ok) {
              segments.push({
                kind: 'artifact',
                artifactType: candidateType,
                value: validated.value as Record<string, unknown>,
              });
            } else {
              segments.push({ kind: 'text', content: remainder });
            }
          } else {
            segments.push({
              kind: 'artifact',
              artifactType: candidateType,
              value: parsed,
            });
          }
        } catch {
          segments.push({ kind: 'text', content: remainder });
        }
      } else {
        segments.push({ kind: 'text', content: remainder });
      }
    } else {
      segments.push({ kind: 'text', content: remainder });
    }
  }

  return segments.length > 0 ? segments : [{ kind: 'text', content: text }];
}

export function parseArtifactBlocks(
  content: string,
  options: ParseArtifactBlocksOptions = {},
): ParsedArtifactSegment[] {
  const segments: ParsedArtifactSegment[] = [];
  if (!content) return [{ kind: 'text', content: '' }];

  const regex = new RegExp(ARTIFACT_BLOCK_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const textBefore = content.slice(lastIndex, match.index);
    if (textBefore.trim().length > 0) {
      segments.push({ kind: 'text', content: textBefore });
    }

    const artifactType = match[1];
    const rawBody = match[2] ?? '';

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (error) {
      segments.push({
        kind: 'invalid',
        artifactType,
        raw: rawBody,
        reason: error instanceof Error ? error.message : 'Invalid JSON',
      });
      lastIndex = match.index + match[0].length;
      continue;
    }

    const merged = { ...(parsed as Record<string, unknown>), type: artifactType };

    if (ZOD_VALIDATED_ARTIFACT_TYPES.has(artifactType)) {
      const validated = tryParseArtifact(artifactType, merged);
      if (validated.ok) {
        segments.push({
          kind: 'artifact',
          artifactType,
          value: validated.value as Record<string, unknown>,
        });
      } else {
        segments.push({
          kind: 'invalid',
          artifactType,
          raw: rawBody,
          reason: 'Zod validation failed',
        });
      }
    } else {
      segments.push({ kind: 'artifact', artifactType, value: merged });
    }

    lastIndex = match.index + match[0].length;
  }

  const remainder = content.slice(lastIndex);
  if (remainder.trim().length > 0) {
    if (options.allowStreaming) {
      const streamingMatch = UNCLOSED_ARTIFACT_REGEX.exec(remainder);
      if (streamingMatch) {
        const textBeforeStreaming = remainder.slice(0, streamingMatch.index);
        if (textBeforeStreaming.trim().length > 0) {
          segments.push({ kind: 'text', content: textBeforeStreaming });
        }
        segments.push({
          kind: 'streaming',
          artifactType: streamingMatch[1],
          raw: streamingMatch[2] ?? '',
        });
      } else {
        segments.push({ kind: 'text', content: remainder });
      }
    } else {
      segments.push({ kind: 'text', content: remainder });
    }
  }

  const finalSegments: ParsedArtifactSegment[] =
    segments.length > 0 ? segments : [{ kind: 'text', content: '' }];

  // Lenient recovery: expand any text segment that still contains a plain
  // ```json fence carrying a serialized artifact object. The last text segment
  // may also contain an unclosed trailing fence while the response streams in;
  // we only enable that branch on the final segment so earlier prose (e.g. an
  // intro paragraph) isn't misclassified.
  const expanded: ParsedArtifactSegment[] = [];
  for (let i = 0; i < finalSegments.length; i++) {
    const seg = finalSegments[i];
    if (seg.kind !== 'text') {
      expanded.push(seg);
      continue;
    }
    const isLast = i === finalSegments.length - 1;
    const recovered = recoverArtifactsFromPlainFences(
      seg.content,
      isLast && !!options.allowStreaming,
    );
    expanded.push(...recovered);
  }

  return expanded.length > 0 ? expanded : [{ kind: 'text', content: '' }];
}

/** Strip every closed artifact block from the text (e.g. for user message display or copy-to-clipboard). */
export function stripArtifactBlocks(content: string): string {
  let out = content.replace(new RegExp(ARTIFACT_BLOCK_REGEX.source, 'g'), '');
  out = out.replace(new RegExp(LENIENT_JSON_FENCE_REGEX.source, 'g'), (whole, body: string) => {
    const trimmed = (body ?? '').trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return whole;
    try {
      const parsed = JSON.parse(trimmed) as { type?: unknown };
      const t = typeof parsed?.type === 'string' ? parsed.type : '';
      return t && KNOWN_ARTIFACT_TYPES.has(t) ? '' : whole;
    } catch {
      return whole;
    }
  });
  return out.trim();
}
