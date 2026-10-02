'use strict';
function hasImages(messages) {
  return messages.some(message => Array.isArray(message.content) && message.content.some(block => block.type === 'image' || block.type === 'image_url') || Array.isArray(message.images) && message.images.length || message.attachments?.images?.length > 0);
}
function validateModelHandoff(model, messages) {
  if (!model?.id || !model.api || !Array.isArray(model.input)) throw new Error('The selected chat model has incomplete capabilities');
  if (hasImages(messages || []) && !model.input.includes('image')) throw new Error('This conversation contains images. Select a model that accepts images to continue with its full history.');
  if (!(model.contextWindow > 0) || !(model.maxTokens > 0)) throw new Error('The selected model has no valid context limits');
  return model;
}
module.exports = { validateModelHandoff, hasImages };
