'use strict';
const { z } = require('zod');
const { BrowserOptionsSchema } = require('./options.cjs');
const schema = z.object({
  browser: BrowserOptionsSchema.default({}),
  initialActions: z.array(z.object({ name: z.string().min(1).max(100), args: z.record(z.string(), z.unknown()).default({}) })).max(20).default([]),
  includeTools: z.array(z.string()).max(200).optional(),
  excludeTools: z.array(z.string()).max(200).default([]),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  extractionModel: z.object({ provider: z.string().min(1), model: z.string().min(1), baseUrl: z.string().url().optional() }).strict().optional(),
  maxHistoryItems: z.number().int().min(10).max(1000).optional(),
  llmTimeoutMs: z.number().int().min(1000).max(600000).default(90000),
  stepTimeoutMs: z.number().int().min(1000).max(600000).default(120000),
  maxFailures: z.number().int().min(0).max(3).default(3),
  finalResponseAfterFailure: z.boolean().default(true),
  useThinking: z.boolean().default(true),
  flashMode: z.boolean().default(false),
}).strict();

function readOptions(database) {
  const raw = require('../core/settings-secrets.cjs').readSettingSecret(database.getQueries(), 'browser_runtime_options_token');
  return schema.parse(raw ? JSON.parse(raw) : {});
}
function applyOptions(opts, database) {
  const config = opts.localRuntimeOptions ? schema.parse(opts.localRuntimeOptions) : readOptions(database);
  opts.browserOptions ||= config.browser;
  opts.outputSchema ||= config.outputSchema;
  opts.extractionModel ||= config.extractionModel;
  opts.localRuntimeOptions = config;
  if (!config.useThinking || config.flashMode) opts.thinkingLevel = 'off';
  if (config.maxHistoryItems && Array.isArray(opts.messages)) {
    // Preserve tool-call/result pairs and complete user turns; never slice individual messages.
    const turns = []; let turn = [];
    const system = opts.messages.filter((message) => message.role === 'system');
    for (const message of opts.messages.filter((message) => message.role !== 'system')) {
      if (message.role === 'user' && turn.length) { turns.push(turn); turn = []; }
      turn.push(message);
    }
    if (turn.length) turns.push(turn);
    let size = 0;
    const kept = [];
    for (const group of turns.reverse()) { if (kept.length && size + group.length > config.maxHistoryItems) break; kept.unshift(group); size += group.length; }
    opts.messages = [...system, ...kept.flat()];
  }
  return config;
}
function filterTools(tools, config) {
  return tools.filter((tool) => (!config.includeTools || config.includeTools.includes(tool.name)) && !config.excludeTools.includes(tool.name));
}
module.exports = { schema, readOptions, applyOptions, filterTools };
