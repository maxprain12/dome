'use strict';

const { z } = require('zod');

const PROTOCOL_VERSION = 2;
const DEFAULT_PORT = 37215;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;
const MAX_NOTE_CHARS = 400_000;
const MAX_SELECTION_CHARS = 50_000;
const MAX_PAGE_TEXT_CHARS = 24_000;
const MAX_BIO_CHARS = 4_000;
const PAIR_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'dxt_';
const MAX_ATTACHMENTS = 2;
const MAX_ATTACHMENT_DATA_URL_CHARS = 400_000;
const MAX_RESOURCE_CONTENT_CHARS = 50_000;

const ThreadIdSchema = z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/);
const StreamIdSchema = z.string().regex(/^[a-zA-Z0-9:_-]{1,80}$/);
const ResourceIdSchema = z.string().min(1).max(200);

const EXTENSION_PROTOCOLS = new Set([
  'chrome-extension:',
  'moz-extension:',
  'safari-web-extension:',
  'safari-extension:',
]);

const IdentitySourceSchema = z.enum([
  'social_linkedin', 'github',
  'social_instagram',
  'social_x',
  'website',
  'email',
  'manual',
]);

const PairBodySchema = z.object({
  code: z.string().min(6).max(12),
  clientName: z.string().min(1).max(80).optional(),
}).strict();

const CreateNoteBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  markdown: z.string().max(MAX_NOTE_CHARS).optional(),
}).strict();

const UpdateNoteBodySchema = z.object({
  markdown: z.string().max(MAX_NOTE_CHARS),
  expectedUpdatedAt: z.number().finite(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  title: z.string().min(1).max(200).optional(),
}).strict();

const AppendNoteBodySchema = z.object({
  text: z.string().min(1).max(MAX_SELECTION_CHARS),
  title: z.string().max(300).optional(),
  url: z.string().url(),
  expectedUpdatedAt: z.number().finite(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capturedAt: z.number().finite().optional(),
}).strict();

const ContactBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  displayName: z.string().min(1).max(200),
  source: IdentitySourceSchema,
  externalId: z.string().min(1).max(500),
  displayLabel: z.string().max(200).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
  primaryEmail: z.string().email().optional(),
  notes: z.string().max(MAX_BIO_CHARS).optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  pageUrl: z.string().url().optional(),
}).strict();

const CaptureUrlBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  url: z.string().url(),
  title: z.string().min(1).max(300),
  readableText: z.string().max(80_000).optional(),
  mediaKind: z.enum(['page', 'article', 'video', 'youtube']).optional(),
}).strict();

const ImageAttachmentSchema = z.object({
  dataUrl: z.string()
    .min(1)
    .max(MAX_ATTACHMENT_DATA_URL_CHARS)
    .regex(/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']).optional(),
  name: z.string().min(1).max(160).optional(),
}).strict();

const PinnedResourceSchema = z.object({
  id: ResourceIdSchema,
  title: z.string().min(1).max(300),
  kind: z.string().min(1).max(80).optional(),
  type: z.string().min(1).max(80).optional(),
}).strict();

const AiStreamBodySchema = z.object({
  browserTools: z.boolean().optional(),
  threadId: ThreadIdSchema.optional(),
  action: z.enum(['summarize', 'key_ideas', 'ask']),
  text: z.string().max(MAX_PAGE_TEXT_CHARS).optional().default(''),
  prompt: z.string().max(4_000).optional(),
  url: z.string().url().optional(),
  title: z.string().max(300).optional(),
  streamId: StreamIdSchema.optional(),
  model: z.string().trim().min(1).max(200).optional(),
  toolsEnabled: z.boolean().optional(),
  resourceToolsEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  projectId: z.string().min(1).max(120).optional(),
  thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
  mcpServerIds: z.array(z.string().min(1).max(120)).max(20).optional(),
  pinnedResources: z.array(PinnedResourceSchema).max(20).optional(),
  attachments: z.object({
    images: z.array(ImageAttachmentSchema).max(MAX_ATTACHMENTS),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.text.trim() && !String(value.prompt || '').trim() && !value.attachments?.images.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'text, prompt, or an attachment is required' });
  }
});

const AiToolResultBodySchema = z.object({
  streamId: StreamIdSchema,
  callId: z.string().uuid(),
  result: z.record(z.string(), z.unknown()),
}).strict();

const AiCancelBodySchema = z.object({
  streamId: StreamIdSchema,
}).strict();

const ApprovalDecisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('approve') }).strict(),
  z.object({ type: z.literal('approve_all') }).strict(),
  z.object({ type: z.literal('reject'), message: z.string().max(1_000).optional() }).strict(),
  z.object({
    type: z.literal('edit'),
    editedAction: z.object({
      name: z.string().min(1).max(160),
      args: z.record(z.string(), z.unknown()),
    }).strict(),
  }).strict(),
]);

const AiResumeBodySchema = z.object({
  streamId: StreamIdSchema,
  decision: ApprovalDecisionSchema,
}).strict();

const SessionPinBodySchema = z.object({
  pinned: z.boolean(),
}).strict();

const ResourceSearchBodySchema = z.object({
  query: z.string().min(1).max(500),
  projectId: z.string().min(1).max(120).optional(),
  type: z.string().min(1).max(80).optional(),
  limit: z.number().int().min(1).max(30).optional(),
  semanticMinScore: z.number().min(0).max(1).optional(),
}).strict();

const ResourceHydrateBodySchema = z.object({
  ids: z.array(ResourceIdSchema).min(1).max(20),
  includeContent: z.boolean().optional(),
  maxContentChars: z.number().int().min(0).max(MAX_RESOURCE_CONTENT_CHARS).optional(),
}).strict();

const ModelsQuerySchema = z.object({}).strict();

function isAllowedExtensionOrigin(origin) {
  if (origin == null || origin === '') return false;
  if (origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    if (!EXTENSION_PROTOCOLS.has(parsed.protocol) || !parsed.hostname) return false;
    if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
      return false;
    }
    return parsed.pathname === '' || parsed.pathname === '/';
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (isAllowedExtensionOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

module.exports = {
  PROTOCOL_VERSION,
  DEFAULT_PORT,
  HOST,
  MAX_BODY_BYTES,
  MAX_NOTE_CHARS,
  MAX_SELECTION_CHARS,
  MAX_PAGE_TEXT_CHARS,
  MAX_BIO_CHARS,
  PAIR_TTL_MS,
  TOKEN_PREFIX,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_DATA_URL_CHARS,
  MAX_RESOURCE_CONTENT_CHARS,
  ThreadIdSchema,
  StreamIdSchema,
  ResourceIdSchema,
  EXTENSION_PROTOCOLS,
  PairBodySchema,
  CreateNoteBodySchema,
  UpdateNoteBodySchema,
  AppendNoteBodySchema,
  ContactBodySchema,
  CaptureUrlBodySchema,
  AiStreamBodySchema,
  AiCancelBodySchema,
  AiToolResultBodySchema,
  AiResumeBodySchema,
  SessionPinBodySchema,
  ResourceSearchBodySchema,
  ResourceHydrateBodySchema,
  ModelsQuerySchema,
  isAllowedExtensionOrigin,
  corsHeaders,
};
