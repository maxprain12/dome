'use strict';
const { z } = require('zod');

const SizeSchema = z.object({ width: z.number().int().min(320).max(4096), height: z.number().int().min(240).max(4096) }).strict();
const BrowserOptionsSchema = z.object({
  backend: z.enum(['electron', 'chromium']).default('electron'),
  profile: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),
  keepAlive: z.boolean().default(false),
  viewport: SizeSchema.default({ width: 1280, height: 720 }),
  deviceScaleFactor: z.number().min(0.5).max(4).default(1),
  userAgent: z.string().max(1000).optional(),
  mobile: z.boolean().default(false),
  allowedDomains: z.array(z.string().min(1).max(250)).max(1000).default([]),
  prohibitedDomains: z.array(z.string().min(1).max(250)).max(1000).default([]),
  permissions: z.array(z.enum(['clipboard-read', 'notifications', 'media', 'geolocation'])).default([]),
  proxy: z.string().url().optional(),
  waitAfterLoadMs: z.number().int().min(0).max(5000).default(250),
  waitBetweenActionsMs: z.number().int().min(0).max(5000).default(0),
  useVision: z.enum(['auto', 'on', 'off']).default('auto'),
  highlightElements: z.boolean().default(false),
  crossOriginFrames: z.boolean().default(false),
  acceptDownloads: z.boolean().default(false),
  autoDownloadPdfs: z.boolean().default(false),
  record: z.enum(['off', 'gif', 'mp4']).default('off'),
  recordFps: z.number().int().min(1).max(30).default(10),
  recordHar: z.boolean().default(false),
  traces: z.boolean().default(false),
  headless: z.boolean().default(true),
  executablePath: z.string().min(1).max(2000).optional(),
  channel: z.enum(['chrome', 'chrome-beta', 'msedge']).optional(),
  cdpUrl: z.string().url().optional(),
  args: z.array(z.string().max(2000)).max(100).default([]),
  env: z.record(z.string(), z.string()).optional(),
  devtools: z.boolean().default(false),
  ignoreDefaultArgs: z.array(z.string()).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.backend === 'electron' && (value.executablePath || value.channel || value.cdpUrl || value.args.length || value.env || value.ignoreDefaultArgs)) {
    ctx.addIssue({ code: 'custom', message: 'Custom launch options require the chromium backend' });
  }
  if (value.backend === 'electron' && value.devtools) ctx.addIssue({ code: 'custom', message: 'DevTools launch options require the chromium backend' });
  if (value.autoDownloadPdfs && !value.acceptDownloads) ctx.addIssue({ code: 'custom', message: 'Automatic PDF downloads require downloads to be enabled' });
  if (value.cdpUrl && !['127.0.0.1', '[::1]', 'localhost'].includes(new URL(value.cdpUrl).hostname)) {
    ctx.addIssue({ code: 'custom', message: 'Only local CDP connections are supported' });
  }
});

function matchesDomain(host, pattern) {
  const normalized = pattern.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  if (normalized.startsWith('*.')) return host === normalized.slice(2) || host.endsWith(normalized.slice(1));
  return host === normalized;
}
function assertDomain(url, options) {
  const host = new URL(url).hostname.toLowerCase();
  const allowed = options.allowedDomains || [];
  if (allowed.length && !allowed.some((pattern) => matchesDomain(host, pattern))) throw new Error('Domain is outside the session allowlist');
  if ((options.prohibitedDomains || []).some((pattern) => matchesDomain(host, pattern))) throw new Error('Domain is prohibited');
}
module.exports = { BrowserOptionsSchema, assertDomain, SizeSchema };
