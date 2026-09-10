'use strict';

const { z } = require('zod');

const PROTOCOL_VERSION = 1;
const DEFAULT_PORT = 37215;
const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 1_000_000;
const MAX_NOTE_CHARS = 400_000;
const MAX_SELECTION_CHARS = 50_000;
const MAX_PAGE_TEXT_CHARS = 24_000;
const MAX_BIO_CHARS = 4_000;
const PAIR_TTL_MS = 10 * 60 * 1000;
const TOKEN_PREFIX = 'dxt_';

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
});

const CreateNoteBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  markdown: z.string().max(MAX_NOTE_CHARS).optional(),
});

const UpdateNoteBodySchema = z.object({
  markdown: z.string().max(MAX_NOTE_CHARS),
  expectedUpdatedAt: z.number().finite(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  title: z.string().min(1).max(200).optional(),
});

const AppendNoteBodySchema = z.object({
  text: z.string().min(1).max(MAX_SELECTION_CHARS),
  title: z.string().max(300).optional(),
  url: z.string().url(),
  expectedUpdatedAt: z.number().finite(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  capturedAt: z.number().finite().optional(),
});

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
});

const CaptureUrlBodySchema = z.object({
  projectId: z.string().min(1).max(120),
  url: z.string().url(),
  title: z.string().min(1).max(300),
  readableText: z.string().max(80_000).optional(),
  mediaKind: z.enum(['page', 'article', 'video', 'youtube']).optional(),
});

const AiStreamBodySchema = z.object({
  browserTools: z.boolean().optional(),
  threadId: z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/).optional(),
  action: z.enum(['summarize', 'key_ideas', 'ask']),
  text: z.string().min(1).max(MAX_PAGE_TEXT_CHARS),
  prompt: z.string().max(4_000).optional(),
  url: z.string().url().optional(),
  title: z.string().max(300).optional(),
  streamId: z.string().min(1).max(80).optional(),
});

const AiToolResultBodySchema = z.object({ streamId: z.string().min(1).max(80), callId: z.string().uuid(), result: z.record(z.string(), z.unknown()) });

const AiCancelBodySchema = z.object({
  streamId: z.string().min(1).max(80),
});

function isAllowedExtensionOrigin(origin) {
  if (origin == null || origin === '') return false;
  if (origin === 'null') return true;
  try {
    const parsed = new URL(origin);
    return EXTENSION_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  const allow = isAllowedExtensionOrigin(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
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
  isAllowedExtensionOrigin,
  corsHeaders,
};
