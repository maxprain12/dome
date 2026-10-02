'use strict';
const { z } = require('zod');
const { getModelCollection } = require('./model-collection.cjs');
const selection = { provider: z.string().min(1).max(100).optional(), model: z.string().min(1).max(250).optional() };
const ImageSchema = z.object({ ...selection, prompt: z.string().min(1).max(20000), title: z.string().min(1).max(200).optional(), project_id: z.string().optional() }).strict();
const question = z.discriminatedUnion('type', [
  z.object({ type: z.literal('choice'), instructions: z.string().min(1).max(4000), criteria: z.record(z.string(), z.string().max(4000)) }).strict(),
  z.object({ type: z.literal('score'), instructions: z.string().min(1).max(4000), criteria: z.array(z.string().max(4000)).min(1).max(100) }).strict(),
  z.object({ type: z.literal('bool'), instructions: z.string().min(1).max(4000), criteria: z.object({ true: z.string().max(4000), false: z.string().max(4000) }).strict() }).strict(),
]);
const ClassifySchema = z.object({ ...selection, state: z.record(z.string(), z.json()), questions: z.record(z.string(), question), temperature: z.number().positive().max(10).optional() }).strict();
const definitions = [
  { type: 'function', function: { name: 'image_generate', description: 'Generate an image with the configured image provider and save it as a Dome resource. Provider credentials remain in main. Return resource IDs and observed usage; do not invent output on provider errors.', parameters: z.toJSONSchema(ImageSchema) } },
  { type: 'function', function: { name: 'ai_classify', description: 'Classify structured state with an available classifier model. Ask choice, score or boolean questions with explicit criteria. Returns typed answers and adapter-provided probabilities; never inferred probabilities from a chat response.', parameters: z.toJSONSchema(ClassifySchema) } },
];
async function resolve(type, args, database) {
  const queries = database.getQueries();
  const provider = args.provider || queries.getSetting.get(`ai_${type}_provider`)?.value;
  const id = args.model || queries.getSetting.get(`ai_${type}_model`)?.value;
  if (!provider || !id) throw new Error(`Configure the ${type} model in AI settings first`);
  const models = await getModelCollection(database);
  const model = models.getModelOfType(type, provider, id);
  if (!model) throw new Error(`The selected ${type} model is unavailable`);
  return { models, model };
}
async function generate(raw, context = {}, dependencies = {}) {
  const args = ImageSchema.parse(raw);
  const database = dependencies.database || require('../core/database.cjs');
  const { models, model } = dependencies.resolved || await resolve('image', args, database);
  const response = await models.generateImages(model, { input: [{ type: 'text', text: args.prompt }] }, { signal: context.signal, timeoutMs: 120000 });
  if (response.stopReason !== 'stop') return { success: false, error: response.errorMessage || response.stopReason };
  const resources = [];
  for (const image of response.output.filter(block => block.type === 'image').slice(0, 10)) {
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[image.mimeType];
    if (!extension || !image.data || Buffer.byteLength(image.data, 'base64') > 32000000) throw new Error('Generated image format or size is unsupported');
    const importer = dependencies.importer || require('../tools/ai-tools-handler.cjs').importFileToLibrary;
    const result = await importer({ title: args.title || args.prompt.slice(0, 100), content_base64: image.data, mime_type: image.mimeType,
      filename: `generated-${require('node:crypto').randomUUID()}.${extension}`, project_id: context.automationProjectId || args.project_id });
    if (!result.success) throw new Error(result.error || 'Image resource import failed');
    resources.push(result);
  }
  if (!resources.length) return { success: false, error: 'The provider returned no images' };
  return { success: true, resources, provider: model.provider, model: model.id, usage: response.usage, capturedAt: new Date(response.timestamp).toISOString() };
}
async function classify(raw, context = {}, dependencies = {}) {
  const args = ClassifySchema.parse(raw);
  if (!Object.keys(args.questions).length || Object.keys(args.questions).length > 100 || JSON.stringify(args.state).length > 200000) throw new Error('Classifier input exceeds limits or has no questions');
  const database = dependencies.database || require('../core/database.cjs');
  const { models, model } = dependencies.resolved || await resolve('classifier', args, database);
  const result = await models.classify(model, { state: args.state, questions: args.questions }, { signal: context.signal, timeoutMs: 90000, temperature: args.temperature });
  return { ...result, success: result.stopReason === 'stop', ...(result.stopReason !== 'stop' ? { error: result.errorMessage || result.stopReason } : {}) };
}
module.exports = { ImageSchema, ClassifySchema, definitions, resolve, generate, classify };
