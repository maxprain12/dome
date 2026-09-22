'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');

const PLUGIN_API_VERSION = 1;
const PLUGIN_PERMISSIONS = [
  'notes.read',
  'notes.write',
  'content.publish',
  'resources.read',
  'projects.read',
  'calendar.read',
];

const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);
const relativeEntrySchema = z.string().min(1).max(240).refine(
  (value) => !value.startsWith('/') && !value.includes('..') && !value.includes('\\'),
  'must be a safe relative path',
);

const fieldSchema = z.object({
  id: identifierSchema,
  type: z.enum(['text', 'date', 'tags', 'slug', 'sitePath', 'select']),
  label: z.string().min(1).max(80),
  options: z.array(z.string().min(1).max(80)).max(50).optional(),
  required: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'select' && (!value.options || value.options.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'Select fields require options' });
  }
  if (value.type !== 'select' && value.options) {
    ctx.addIssue({ code: 'custom', message: 'Only select fields can declare options' });
  }
  if (value.options && new Set(value.options).size !== value.options.length) {
    ctx.addIssue({ code: 'custom', message: 'Select field options must be unique' });
  }
});

const viewContributionSchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(80),
}).strict();

const vaultTemplateSchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(80),
  schemaVersion: z.number().int().positive(),
  fields: z.array(fieldSchema).max(24),
}).strict().superRefine((value, ctx) => {
  const ids = new Set();
  for (const field of value.fields) {
    if (ids.has(field.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate field id: ${field.id}` });
    }
    ids.add(field.id);
  }
});

const manifestSchema = z.object({
  id: identifierSchema,
  name: z.string().min(1).max(80),
  author: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  minDomeVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).optional(),
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).optional(),
  apiVersion: z.literal(PLUGIN_API_VERSION).optional(),
  type: z.enum(['pet', 'view']).optional(),
  entry: relativeEntrySchema.optional(),
  permissions: z.array(z.enum(PLUGIN_PERMISSIONS)).max(PLUGIN_PERMISSIONS.length).optional(),
  contributes: z.object({
    view: viewContributionSchema.optional(),
    vaultTemplate: vaultTemplateSchema.optional(),
  }).strict().optional(),
  sprites: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'view' && !value.entry) {
    ctx.addIssue({ code: 'custom', message: 'View plugins require entry' });
  }
  if (value.contributes && value.apiVersion !== PLUGIN_API_VERSION) {
    ctx.addIssue({ code: 'custom', message: 'Contributions require apiVersion 1' });
  }
  if (value.permissions?.includes('notes.write') && !value.permissions.includes('notes.read')) {
    ctx.addIssue({ code: 'custom', message: 'notes.write requires notes.read' });
  }
});

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || ''));
  return match ? match.slice(1).map(Number) : null;
}

function isVersionAtLeast(actual, minimum) {
  const left = parseVersion(actual);
  const right = parseVersion(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

function validateManifest(input, domeVersion) {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { valid: false, error: first?.message || 'Invalid manifest' };
  }
  if (parsed.data.minDomeVersion && !isVersionAtLeast(domeVersion, parsed.data.minDomeVersion)) {
    return {
      valid: false,
      error: `Requires Dome ${parsed.data.minDomeVersion} or later`,
    };
  }
  return { valid: true, manifest: parsed.data };
}

function digestManifest(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

module.exports = {
  PLUGIN_API_VERSION,
  PLUGIN_PERMISSIONS,
  digestManifest,
  manifestSchema,
  validateManifest,
};
