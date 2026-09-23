import { describe, expect, it } from 'vitest';
import { adaptationBatchPrompt, adaptationPrompt, parseAdaptedBatch, parseAdaptedEntry } from './adapt-languages';

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
});
