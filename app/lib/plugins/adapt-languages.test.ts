import { describe, expect, it } from 'vitest';
import { adaptationBatchPrompt, adaptationPrompt, generateCmsTranslations, hasUntranslatedBody, parseAdaptedBatch, parseAdaptedEntry } from './adapt-languages';

describe('CMS language adaptation', () => {
  it('asks the model to keep media references and return JSON', () => {
    const prompt = adaptationPrompt({
      targetLanguage: 'en',
      title: 'Prueba',
      description: 'Una guía',
      slug: 'prueba',
      body: '![foto](dome-media:11111111-1111-4111-8111-111111111111)',
    });
    expect(prompt).toMatch(/Target language: en/);
    expect(prompt).toMatch(/dome-media:/);
  });

  it('parses a JSON payload and slugifies the translated title', () => {
    expect(parseAdaptedEntry(JSON.stringify({
      title: 'Getting started',
      description: 'A guide',
      slug: 'Getting Started!',
      body: '# Getting started',
    }), 'Prueba')).toEqual({
      title: 'Getting started',
      description: 'A guide',
      slug: 'getting-started',
      body: '# Getting started',
    });
  });

  it('parses every target language from one batch', () => {
    const prompt = adaptationBatchPrompt({
      sourceLanguage: 'es',
      targets: ['en', 'fr'],
      title: 'Prueba',
      description: 'Una guía',
      slug: 'prueba',
      body: 'cuerpo',
    });
    expect(prompt).toMatch(/Target languages: en, fr/);
    expect(parseAdaptedBatch(JSON.stringify({
      translations: [
        { language: 'en', title: 'Test', description: 'A test', slug: 'test', body: '# Test' },
        { language: 'fr', title: 'Essai', description: 'Un essai', slug: 'essai', body: '# Essai' },
      ],
    }), ['en', 'fr'], 'Prueba')).toEqual([
      { language: 'en', title: 'Test', description: 'A test', slug: 'test', body: '# Test' },
      { language: 'fr', title: 'Essai', description: 'Un essai', slug: 'essai', body: '# Essai' },
    ]);
  });

  it('retries copied prose and never publishes an unchanged body', async () => {
    const input = { sourceLanguage: 'es', targets: ['en'], title: 'Noticias', description: 'Noticias recientes', slug: 'noticias', body: 'Ha salido un nuevo modelo de IA.' };
    const replies = [
      JSON.stringify({ translations: [{ language: 'en', title: 'News', description: 'Recent news', slug: 'news', body: input.body }] }),
      JSON.stringify({ title: 'News', description: 'Recent news', slug: 'news', body: 'A new AI model has been released.' }),
    ];
    const calls: string[] = [];
    const translated = await generateCmsTranslations(input, async (prompt) => { calls.push(prompt); return replies.shift()!; });
    expect(translated[0].body).toBe('A new AI model has been released.');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain('Translate the entire body');
    await expect(generateCmsTranslations(input, async (prompt) => prompt.includes('every target')
      ? JSON.stringify({ translations: [{ language: 'en', title: 'News', body: input.body }] })
      : JSON.stringify({ title: 'News', body: input.body }))).rejects.toThrow('ADAPT_UNTRANSLATED');
  });

  it('preserves bodies containing only media and code', () => {
    expect(hasUntranslatedBody('![image](dome-media:id)\n\n```js\nconst ready = true\n```', '![image](dome-media:id)\n\n```js\nconst ready = true\n```')).toBe(false);
  });

  it('rejects a translation that changes the image target', async () => {
    const input = { sourceLanguage: 'es', targets: ['en'], title: 'Noticia', description: '', slug: 'noticia', body: 'Una foto. ![Portada](dome-media:original)' };
    const first = JSON.stringify({ translations: [{ language: 'en', title: 'News', body: 'A photo. ![Cover](dome-media:wrong)' }] });
    const retry = JSON.stringify({ title: 'News', body: 'A photo. ![Cover](dome-media:wrong)' });
    const replies = [first, retry];
    await expect(generateCmsTranslations(input, async () => replies.shift()!)).rejects.toThrow('ADAPT_MEDIA_CHANGED');
  });
});
