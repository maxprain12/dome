
'use strict';
const { z } = require('zod');
const { CHANNELS } = require('./catalog.cjs');
const Platform = z.enum(CHANNELS.map(([name]) => name));
const Url = z.string().url().max(4000).refine((value) => /^https?:\/\//i.test(value));
const Input = z.object({
  platform: Platform.default('web'),
  url: Url.optional(),
  query: z.string().trim().min(1).max(1000).optional(),
  count: z.number().int().min(1).max(10).default(5),
  source: z.enum(['http', 'browser']).default('http'),
  project_id: z.string().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  urls: z.array(Url).max(30).optional(),
  save: z.boolean().default(false),
}).strict();
const Policy = z.object({
  enabledProviders: z.array(z.enum(['brave', 'tavily', 'exa'])).max(3),
  perRunUsd: z.number().finite().min(0).max(100),
  monthlyUsd: z.number().finite().min(0).max(1000),
}).strict();
module.exports = { Input, Policy, Platform, Url };
